#!/usr/bin/env python3
"""Batch or single-pair inference using a trained run checkpoint."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd
import torch

from context import pair_text_for_model
from inference import (
    is_ensemble_run,
    load_ensemble_bundle,
    load_model_bundle,
    resolve_device,
    resolve_run_directory,
)
from metrics import logits_argmax_to_eval


def normalize_row(row: dict) -> dict:
    """Accept LLMorpheus CSV rows or minimal ``original_code`` / ``mutant_code`` pairs."""
    out = dict(row)
    if "original_code" in out and "original" not in out:
        out["original"] = out.get("original_code") or ""
    if "mutant_code" in out and "replacement" not in out:
        out["replacement"] = out.get("mutant_code") or ""
    return out


def _tokenize(tokenizer, text_a: str, text_b: str, max_length: int):
    if text_b == "" or text_b is None:
        return tokenizer(
            text_a,
            max_length=max_length,
            padding="max_length",
            truncation=True,
            return_tensors="pt",
        )
    return tokenizer(
        text_a,
        text_b,
        max_length=max_length,
        padding="max_length",
        truncation=True,
        return_tensors="pt",
    )


@torch.no_grad()
def predict_single(
    model_or_bundle,
    tokenizer,
    device,
    text_a: str,
    text_b: str,
    max_length: int,
    *,
    ensemble: bool,
    threshold: float,
) -> dict:
    enc = _tokenize(tokenizer, text_a, text_b, max_length)
    ids = enc["input_ids"].to(device)
    mask = enc["attention_mask"].to(device)
    if ensemble:
        probs = model_or_bundle.predict_probs(ids, mask)[0]
    else:
        logits = model_or_bundle(ids, mask)
        probs = torch.softmax(logits, dim=-1)[0]
    equiv_p = float(probs[1].item())
    pred = "EQUIVALENT" if equiv_p >= threshold else "BEHAVIORAL_CHANGE"
    return {
        "pred_eval": pred,
        "argmax_pred": logits_argmax_to_eval(int(torch.argmax(probs).item())),
        "equiv_prob": round(equiv_p, 6),
        "confidence": round(max(equiv_p, 1.0 - equiv_p), 6),
        "threshold": threshold,
    }


def parse_window_cfg(cfg_val: object) -> int | str:
    if isinstance(cfg_val, str) and cfg_val.strip().lower() == "full":
        return "full"
    return int(cfg_val)


def resolve_threshold(run_dir: Path, override: float | None, config: dict) -> float:
    if override is not None:
        return float(override)
    th_path = run_dir / "thresholds.json"
    if th_path.is_file():
        try:
            t = json.loads(th_path.read_text(encoding="utf-8"))
            return float(t["macro_f1"]["threshold"])
        except Exception:  # noqa: BLE001
            pass
    return float(config.get("chosen_threshold", 0.5))


def main() -> None:
    parser = argparse.ArgumentParser(description="Predict equivalent vs behavioral-change mutants")
    parser.add_argument("--run-dir", type=Path, required=True)
    parser.add_argument("--csv", type=Path, default=None)
    parser.add_argument("--original", type=str, default=None, help="Mutated fragment (window 0 / fragments-only)")
    parser.add_argument("--replacement", type=str, default=None, help="Replacement fragment")
    parser.add_argument("--window", type=str, default=None, help="Override window from config (int or full)")
    parser.add_argument("--max-length", type=int, default=None)
    parser.add_argument(
        "--threshold",
        type=float,
        default=None,
        help="Override decision threshold (default: tuned macro_f1 from run dir).",
    )
    args = parser.parse_args()
    args.run_dir = resolve_run_directory(args.run_dir)

    device = resolve_device()
    ensemble = is_ensemble_run(args.run_dir)

    if ensemble:
        bundle = load_ensemble_bundle(args.run_dir, device=device)
        model_or_bundle = bundle
        tokenizer = bundle.tokenizer
        config = bundle.config
    else:
        model, tokenizer, config = load_model_bundle(args.run_dir, device=device)
        model_or_bundle = model

    input_format = config.get("input_format", "pair")
    window: int | str
    if args.window is not None:
        ws = args.window.strip().lower()
        window = "full" if ws == "full" else int(args.window)
    else:
        window = parse_window_cfg(config["window"])

    max_len = args.max_length if args.max_length is not None else int(config.get("max_length", 512))
    threshold = resolve_threshold(args.run_dir, args.threshold, config)

    if args.original is not None and args.replacement is not None:
        if window != 0 and window != "0":
            raise SystemExit("--original/--replacement only supports fragment mode (train with --window 0 or pass --window 0).")
        # For ad-hoc CLI use, fall back to legacy 'pair' format unless explicitly window 0 + new input format.
        text_a, text_b = pair_text_for_model({"original": args.original, "replacement": args.replacement}, window, input_format)
        result = predict_single(
            model_or_bundle, tokenizer, device, text_a, text_b, max_len,
            ensemble=ensemble, threshold=threshold,
        )
        print(json.dumps(result, indent=2))
        return

    if args.csv:
        df = pd.read_csv(args.csv)
        results = []
        for i in range(len(df)):
            row = normalize_row(df.iloc[i].to_dict())
            if window != 0 and window != "0":
                needed = {"project", "file", "line"}
                if not needed <= set(row.keys()):
                    raise ValueError(
                        f"Row {i}: window={window} requires columns {needed} (got keys {list(row.keys())})"
                    )
            text_a, text_b = pair_text_for_model(row, window, input_format)
            result = predict_single(
                model_or_bundle, tokenizer, device, text_a, text_b, max_len,
                ensemble=ensemble, threshold=threshold,
            )
            results.append(result)
        out_df = pd.concat([df.reset_index(drop=True), pd.DataFrame(results)], axis=1)
        outp = args.csv.parent / f"{args.csv.stem}.predictions.csv"
        out_df.to_csv(outp, index=False)
        print(f"Wrote {outp} (threshold={threshold:.4f})", flush=True)
        return

    raise SystemExit("Provide --csv PATH or both --original and --replacement (fragments-only).")


if __name__ == "__main__":
    main()
