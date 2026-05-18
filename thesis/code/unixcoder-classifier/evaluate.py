#!/usr/bin/env python3
"""Re-score a saved run checkpoint on a labeled CSV (default: data/validation.csv)."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd
import torch
from torch.utils.data import DataLoader

from context import eval_label_from_row
from dataset import MutantDataset
from inference import (
    is_ensemble_run,
    load_ensemble_bundle,
    load_model_bundle,
    resolve_device,
    resolve_run_directory,
)
from metrics import (
    compute_metrics_dict,
    logits_argmax_to_eval,
    thresholded_pred_labels,
)

PACKAGE_ROOT = Path(__file__).resolve().parent
DATA_DIR = PACKAGE_ROOT / "data"


@torch.no_grad()
def run_inference_loader_single(model, loader, device):
    preds = []
    probs = []
    for batch in loader:
        ids = batch["input_ids"].to(device)
        mask = batch["attention_mask"].to(device)
        logits = model(ids, mask)
        p = torch.softmax(logits, dim=-1)
        preds.extend(torch.argmax(logits, dim=-1).cpu().numpy().tolist())
        probs.extend(p[:, 1].cpu().numpy().tolist())
    return preds, probs


@torch.no_grad()
def run_inference_loader_ensemble(bundle, loader):
    preds = []
    probs = []
    for batch in loader:
        ids = batch["input_ids"].to(bundle.device)
        mask = batch["attention_mask"].to(bundle.device)
        p = bundle.predict_probs(ids, mask)
        preds.extend(torch.argmax(p, dim=-1).cpu().numpy().tolist())
        probs.extend(p[:, 1].cpu().numpy().tolist())
    return preds, probs


def parse_window(cfg_val: object) -> int | str:
    if isinstance(cfg_val, str) and cfg_val.strip().lower() == "full":
        return "full"
    return int(cfg_val)


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate a unixcoder-classifier run directory")
    parser.add_argument("--run-dir", type=Path, required=True, help="Path to runs/<timestamp>-...")
    parser.add_argument("--csv", type=Path, default=DATA_DIR / "validation.csv")
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--max-length", type=int, default=None, help="Defaults to config.json value")
    parser.add_argument(
        "--threshold",
        type=float,
        default=None,
        help="Override decision threshold on equivalent probability (default: from thresholds.json/macro_f1, else 0.5).",
    )
    parser.add_argument("--output", type=Path, default=None, help="Optional predictions CSV path")
    args = parser.parse_args()
    args.run_dir = resolve_run_directory(args.run_dir)

    device = resolve_device()
    ensemble = is_ensemble_run(args.run_dir)

    if ensemble:
        bundle = load_ensemble_bundle(args.run_dir, device=device)
        tokenizer = bundle.tokenizer
        config = bundle.config
        input_format = config.get("input_format", "pair")
    else:
        model, tokenizer, config = load_model_bundle(args.run_dir, device=device)
        input_format = config.get("input_format", "pair")

    window = parse_window(config["window"])
    max_len = args.max_length if args.max_length is not None else int(config.get("max_length", 512))

    threshold = args.threshold
    if threshold is None:
        th_path = Path(args.run_dir) / "thresholds.json"
        if th_path.is_file():
            try:
                t = json.loads(th_path.read_text(encoding="utf-8"))
                threshold = float(t["macro_f1"]["threshold"])
            except Exception:  # noqa: BLE001
                threshold = None
        if threshold is None:
            threshold = float(config.get("chosen_threshold", 0.5))

    df = pd.read_csv(args.csv)
    ds = MutantDataset(
        args.csv,
        tokenizer,
        max_length=max_len,
        window_or_full=window,
        input_format=input_format,
    )
    loader = DataLoader(ds, batch_size=args.batch_size, shuffle=False, num_workers=0)

    if ensemble:
        argmax_preds, equiv_p = run_inference_loader_ensemble(bundle, loader)
    else:
        argmax_preds, equiv_p = run_inference_loader_single(model, loader, device)

    gold_eval = [eval_label_from_row(df.iloc[i].to_dict()) for i in range(len(df))]
    pred_eval = thresholded_pred_labels(equiv_p, threshold)
    pairs = [(g, pred_eval[i]) for i, g in enumerate(gold_eval) if g is not None]
    metrics = compute_metrics_dict([p[0] for p in pairs], [p[1] for p in pairs])

    print(
        json.dumps(
            {
                "threshold": threshold,
                **{k: v for k, v in metrics.items() if k != "confusion"},
            },
            indent=2,
            default=float,
        )
    )

    out_csv = args.output
    if out_csv:
        rows = []
        for i in range(len(df)):
            row = df.iloc[i].to_dict()
            gold = eval_label_from_row(row)
            rows.append(
                {
                    **{k: row.get(k, "") for k in ("project", "file", "id", "line", "column", "original", "replacement", "coding")},
                    "gold_eval": gold or "",
                    "pred_eval": pred_eval[i],
                    "argmax_pred": logits_argmax_to_eval(argmax_preds[i]),
                    "equiv_prob": round(float(equiv_p[i]), 6),
                    "correct": gold == pred_eval[i] if gold else "",
                }
            )
        pd.DataFrame(rows).to_csv(out_csv, index=False)
        print(f"Wrote {out_csv}", flush=True)


if __name__ == "__main__":
    main()
