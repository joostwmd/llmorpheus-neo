#!/usr/bin/env python3
"""Pre-hoc / post-hoc context-window sensitivity analysis.

Run this *before* GEPA to pick a context window using the seed prompt
(the deployment-window-then-optimize-prompt workflow). Re-run after GEPA
with ``--candidate`` to do a robustness check at multiple windows.

Usage:
    # Pre-hoc: pick window using the default seed template
    python window_sensitivity.py --windows 3 5 10 20 full

    # Post-hoc: same sweep but with an evolved prompt
    python window_sensitivity.py --candidate experiments/gepa_*/best_candidate.json

Each run writes a timestamped folder under ``experiments/window_sensitivity_*``
containing per-window detail JSON files and a top-level ``summary.json`` with the
metric table and the recommended optimum (highest score = kappa - lambda*FP/N).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

load_dotenv()

sys.path.insert(0, str(Path(__file__).parent))

from classifier import (
    ClassifierProtocol,
    extract_context,
    fill_template,
    get_hardcoded_prompt,
    make_classifier,
    require_env_for_task_model,
)
from evaluation import (
    build_confusion_matrix,
    cohens_kappa,
    mcc,
    precision_equiv,
    recall_equiv,
    f1_score,
    accuracy,
    confusion_total,
    kappa_with_fp_penalty,
    normalize_ground_truth_label,
    normalize_prediction_label,
)
from sampling import stratified_subset


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Context window sensitivity sweep")
    parser.add_argument("--validation-csv", default="data/validation.csv")
    parser.add_argument("--n-equivalent", type=int, default=20)
    parser.add_argument("--n-behavioral", type=int, default=60)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--lambda-fp", type=float, default=0.5)
    parser.add_argument("--classifier-model", default="openrouter/openai/gpt-4o-mini")
    parser.add_argument("--windows", nargs="+", default=["3", "5", "10", "20", "full"],
                        help="Window sizes to sweep (int or 'full')")
    # Template system removed - using hardcoded prompt
    parser.add_argument("--candidate", type=str, default=None,
                        help="Path to best_candidate.json from GEPA (expects {\"prompt\": ...}).")
    parser.add_argument("--prompt-file", type=str, default=None,
                        help="Plain-text prompt file (e.g. best_prompt.txt). Overrides candidate.")
    return parser.parse_args()


def parse_window(raw: str) -> int | str:
    if raw.strip().lower() == "full":
        return "full"
    try:
        return int(raw)
    except ValueError as e:
        raise SystemExit(f"window must be an integer or 'full', got {raw!r}") from e


def load_prompt_pair(args: argparse.Namespace) -> tuple[str, str, dict[str, Any]]:
    """Return (system_prompt, user_template, provenance_dict)."""
    if getattr(args, "prompt_file", None):
        path = Path(args.prompt_file).expanduser().resolve()
        text = path.read_text(encoding="utf-8")
        return "", text.strip(), {"source": "prompt_file", "path": str(path)}
    if args.candidate:
        cand_data = json.loads(Path(args.candidate).read_text(encoding="utf-8"))
        if "prompt" in cand_data:
            return "", cand_data["prompt"], {"source": "candidate", "path": args.candidate}
        return cand_data.get("system_prompt", ""), cand_data.get("user_template", ""), {
            "source": "candidate", "path": args.candidate}
    return "", get_hardcoded_prompt(), {"source": "hardcoded"}


def evaluate_at_window(
    classifier: ClassifierProtocol,
    system_prompt: str,
    user_template: str,
    subset: list[dict[str, str]],
    window: int | str,
    lam: float,
) -> dict[str, Any]:
    pairs: list[tuple[str, str]] = []
    details: list[dict[str, Any]] = []
    tokens_in_total = 0
    tokens_out_total = 0

    for row in subset:
        mutant_id = str(row.get("id"))
        gold = normalize_ground_truth_label(row.get("coding"))
        try:
            ctx = extract_context(row["project"], row["file"], int(row["line"]), window)
            vars_ = {
                "original": row.get("original", ""),
                "replacement": row.get("replacement", ""),
                "context": ctx.get("annotatedText", ""),
            }
            sys_p = fill_template(system_prompt, vars_)
            usr_p = fill_template(user_template, vars_)
            r = classifier.classify(sys_p, usr_p)
            pred = normalize_prediction_label(r.classification)
            if gold and pred:
                pairs.append((gold, pred))
            tokens_in_total += r.input_tokens or 0
            tokens_out_total += r.output_tokens or 0
            details.append({
                "mutant_id": mutant_id,
                "project": row.get("project"),
                "file": row.get("file"),
                "line": row.get("line"),
                "ground_truth": gold,
                "predicted": pred,
                "confidence": r.confidence,
                "mutation_category": r.mutation_category,
                "distinguishing_input": r.distinguishing_input,
                "input_tokens": r.input_tokens,
                "output_tokens": r.output_tokens,
            })
        except Exception as e:  # noqa: BLE001
            details.append({
                "mutant_id": mutant_id,
                "project": row.get("project"),
                "ground_truth": gold,
                "predicted": None,
                "error": f"{type(e).__name__}: {e}",
            })

    cm = build_confusion_matrix(pairs)
    n = confusion_total(cm)
    return {
        "window": window,
        "n_predictions": n,
        "n_errors": sum(1 for d in details if d.get("error")),
        "confusion": {"tp": cm.TP, "fp": cm.FP, "fn": cm.FN, "tn": cm.TN},
        "metrics": {
            "score": kappa_with_fp_penalty(cm, lam=lam),
            "kappa": cohens_kappa(cm),
            "mcc": mcc(cm),
            "precision_eq": precision_equiv(cm),
            "recall_eq": recall_equiv(cm),
            "f1_eq": f1_score(precision_equiv(cm), recall_equiv(cm)),
            "accuracy": accuracy(cm),
        },
        "tokens": {"input_total": tokens_in_total, "output_total": tokens_out_total},
        "details": details,
    }


def main() -> int:
    args = parse_args()
    try:
        require_env_for_task_model(args.classifier_model)
    except RuntimeError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    system_prompt, user_template, provenance = load_prompt_pair(args)
    windows = [parse_window(w) for w in args.windows]

    subset = stratified_subset(
        csv_path=args.validation_csv,
        n_equivalent=args.n_equivalent,
        n_behavioral=args.n_behavioral,
        seed=args.seed,
    )
    n_eq = sum(1 for r in subset if normalize_ground_truth_label(r.get("coding")) == "EQUIVALENT")
    n_beh = len(subset) - n_eq

    out_dir = Path("experiments") / f"window_sensitivity_{datetime.now(timezone.utc):%Y%m%d_%H%M%S}"
    out_dir.mkdir(parents=True, exist_ok=True)

    (out_dir / "run_metadata.json").write_text(
        json.dumps(
            {
                "classifier_model": args.classifier_model,
                "validation_csv": args.validation_csv,
                "subset_equivalent": args.n_equivalent,
                "subset_behavioral": args.n_behavioral,
                "subset_seed": args.seed,
                "lambda_fp": args.lambda_fp,
                "windows": list(args.windows),
                "provenance": provenance,
                "github": {
                    "run_id": os.environ.get("GITHUB_RUN_ID"),
                    "sha": os.environ.get("GITHUB_SHA"),
                    "repository": os.environ.get("GITHUB_REPOSITORY"),
                },
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    classifier = make_classifier(args.classifier_model)

    print("Window sensitivity sweep")
    print("=" * 60)
    print(f"Subset:     {n_eq} EQUIVALENT + {n_beh} BEHAVIORAL_CHANGE  (seed={args.seed})")
    print(f"Windows:    {windows}")
    print(f"lambda_fp:  {args.lambda_fp}")
    print(f"Prompt:     {provenance}")
    print(f"Output:     {out_dir}")
    print("=" * 60)

    all_results: list[dict[str, Any]] = []
    for w in windows:
        t0 = time.time()
        print(f"\n>>> Evaluating window={w} ...")
        res = evaluate_at_window(classifier, system_prompt, user_template, subset, w, args.lambda_fp)
        dt = time.time() - t0
        res["elapsed_seconds"] = dt
        all_results.append(res)
        (out_dir / f"window_{w}.json").write_text(json.dumps(res, indent=2))
        m = res["metrics"]
        cm = res["confusion"]
        print(
            f"    score={m['score'] or 0:.3f}  kappa={m['kappa'] or 0:.3f}  MCC={m['mcc'] or 0:.3f}  "
            f"acc={m['accuracy'] or 0:.3f}  P_eq={m['precision_eq'] or 0:.3f}  R_eq={m['recall_eq'] or 0:.3f}  "
            f"TP={cm['tp']} FP={cm['fp']} FN={cm['fn']} TN={cm['tn']}  ({dt:.1f}s)"
        )

    # Build summary, pick best window by score (kappa - lambda*FP/N).
    rows = []
    for r in all_results:
        rows.append({
            "window": r["window"],
            "score": r["metrics"]["score"],
            "kappa": r["metrics"]["kappa"],
            "mcc": r["metrics"]["mcc"],
            "accuracy": r["metrics"]["accuracy"],
            "precision_eq": r["metrics"]["precision_eq"],
            "recall_eq": r["metrics"]["recall_eq"],
            "f1_eq": r["metrics"]["f1_eq"],
            **r["confusion"],
            "n_predictions": r["n_predictions"],
            "n_errors": r["n_errors"],
            "input_tokens": r["tokens"]["input_total"],
            "output_tokens": r["tokens"]["output_total"],
            "elapsed_seconds": r["elapsed_seconds"],
        })

    best = max(rows, key=lambda r: (r["score"] if r["score"] is not None else -1))
    summary = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "provenance": provenance,
        "subset": {
            "validation_csv": args.validation_csv,
            "n_equivalent": n_eq,
            "n_behavioral": n_beh,
            "seed": args.seed,
        },
        "lambda_fp": args.lambda_fp,
        "windows": [r["window"] for r in rows],
        "rows": rows,
        "best": {"window": best["window"], "score": best["score"], "kappa": best["kappa"]},
    }
    (out_dir / "summary.json").write_text(json.dumps(summary, indent=2))

    print("\n" + "=" * 60)
    print("Window sensitivity summary (by score = kappa - lambda*FP/N)")
    print("=" * 60)
    header = f"{'window':>8}  {'score':>7}  {'kappa':>7}  {'mcc':>7}  {'acc':>7}  {'TP/FP/FN/TN':>14}"
    print(header)
    for r in rows:
        score = r["score"] if r["score"] is not None else float("nan")
        k = r["kappa"] if r["kappa"] is not None else float("nan")
        m_ = r["mcc"] if r["mcc"] is not None else float("nan")
        a = r["accuracy"] if r["accuracy"] is not None else float("nan")
        print(
            f"{str(r['window']):>8}  {score:>7.3f}  {k:>7.3f}  {m_:>7.3f}  {a:>7.3f}  "
            f"{r['tp']:>3}/{r['fp']:>3}/{r['fn']:>3}/{r['tn']:>3}"
        )
    print(f"\n>>> Best window: {best['window']!r}  (score={best['score']:.3f}, kappa={best['kappa']:.3f})")
    print(f"Summary written to: {out_dir / 'summary.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
