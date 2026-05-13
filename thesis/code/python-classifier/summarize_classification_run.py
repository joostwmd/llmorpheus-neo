#!/usr/bin/env python3
"""Summarize a classification JSONL run: confusion matrix, κ, MCC, F1, rates, tokens.

Reads one JSON object per line (same format as ``run_validation.py`` logs): expects keys
``groundTruthLabel`` and ``classification`` per row.

Usage:
  python summarize_classification_run.py runs/your_run.jsonl
  python summarize_classification_run.py runs/your_run.jsonl --lambda-fp 0.5 --out summary.txt

Every metric line includes an inline ``# ...`` comment explaining what it means.
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
from pathlib import Path

from evaluation import (
    ConfusionMatrix,
    accuracy,
    build_confusion_matrix,
    cohens_kappa,
    confusion_total,
    f1_score,
    kappa_with_fp_penalty,
    mcc,
    normalize_ground_truth_label,
    normalize_prediction_label,
    precision_behavioral,
    precision_equiv,
    recall_behavioral,
    recall_equiv,
)


def _fmt_pct(x: float | None) -> str:
    if x is None:
        return "n/a"
    return f"{100.0 * x:.2f}%"


def _fmt_float(x: float | None, nd: int = 4) -> str:
    if x is None:
        return "n/a"
    return f"{x:.{nd}f}"


def summarize_jsonl(
    path: Path,
    *,
    lambda_fp: float,
) -> tuple[list[str], ConfusionMatrix | None, dict[str, int]]:
    """Parse JSONL; return (commented lines, matrix or None, counters)."""
    lines_out: list[str] = []
    raw_lines = path.read_text(encoding="utf-8").splitlines()

    pairs: list[tuple[str, str]] = []
    n_parse_fail = 0
    n_missing_fields = 0
    n_bad_labels = 0

    in_prompt = 0
    in_completion = 0
    latencies: list[int] = []

    for lineno, line in enumerate(raw_lines, start=1):
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            n_parse_fail += 1
            continue
        if not isinstance(obj, dict):
            n_parse_fail += 1
            continue

        gold_raw = obj.get("groundTruthLabel")
        pred_raw = obj.get("classification")
        if gold_raw is None or pred_raw is None:
            n_missing_fields += 1
            continue

        gold = normalize_ground_truth_label(gold_raw)
        pred = normalize_prediction_label(pred_raw)
        if not gold or not pred:
            n_bad_labels += 1
            continue
        pairs.append((gold, pred))

        if isinstance(obj.get("inputTokens"), int):
            in_prompt += obj["inputTokens"]
        if isinstance(obj.get("outputTokens"), int):
            in_completion += obj["outputTokens"]
        if isinstance(obj.get("latencyMs"), int):
            latencies.append(obj["latencyMs"])

    counters = {
        "json_lines_nonempty": sum(1 for L in raw_lines if L.strip()),
        "parse_failures": n_parse_fail,
        "missing_ground_or_pred": n_missing_fields,
        "unusable_labels": n_bad_labels,
        "scored_rows": len(pairs),
    }

    lines_out.append("=" * 78)
    lines_out.append("CLASSIFICATION RUN SUMMARY  (each line ends with  # what it means)")
    lines_out.append("=" * 78)
    lines_out.append("")
    lines_out.append("COVERAGE")
    lines_out.append("-" * 78)
    lines_out.append(
        f"non_empty_json_lines: {counters['json_lines_nonempty']:<6}  "
        f"# lines in file that were non-empty (attempted reads)"
    )
    lines_out.append(
        f"json_decode_errors:   {n_parse_fail:<6}  "
        f"# lines that were not valid JSON objects"
    )
    lines_out.append(
        f"missing_fields:       {n_missing_fields:<6}  "
        f"# dict rows without groundTruthLabel or classification"
    )
    lines_out.append(
        f"unusable_labels:      {n_bad_labels:<6}  "
        f"# gold or prediction could not normalize to EQUIVALENT / BEHAVIORAL_CHANGE"
    )
    lines_out.append(
        f"scored_rows (N):      {len(pairs):<6}  "
        f"# rows used for confusion matrix and all classification metrics below"
    )
    lines_out.append("")

    if not pairs:
        lines_out.append("No scored rows — cannot compute metrics.")
        return lines_out, None, counters

    m = build_confusion_matrix(pairs)
    n = confusion_total(m)

    lines_out.append(
        "CONFUSION MATRIX  (positive class for TP/FP/FN/TN below = EQUIVALENT)"
    )
    lines_out.append("-" * 78)
    lines_out.append(
        f"TP (true positives):     {m.TP:6d}  "
        f"# gold EQUIVALENT, predicted EQUIVALENT — correctly called equivalent"
    )
    lines_out.append(
        f"FN (false negatives):    {m.FN:6d}  "
        f"# gold EQUIVALENT, predicted BEHAVIORAL_CHANGE — missed equivalent"
    )
    lines_out.append(
        f"FP (false positives):    {m.FP:6d}  "
        f"# gold BEHAVIORAL_CHANGE, predicted EQUIVALENT — false equivalent "
        f"(often worst case for mutation testing)"
    )
    lines_out.append(
        f"TN (true negatives):     {m.TN:6d}  "
        f"# gold BEHAVIORAL_CHANGE, predicted BEHAVIORAL_CHANGE — correctly flagged change"
    )
    lines_out.append(
        f"N = TP+FP+FN+TN:         {n:6d}  "
        f"# same as scored_rows; denominator for accuracy / FP-rate / prevalence"
    )
    lines_out.append("")

    # Rates tied to EQUIVALENT as "positive" in the diagnostic sense
    fpr_equiv_pred_on_behav_gold = (m.FP / (m.FP + m.TN)) if (m.FP + m.TN) else None
    fnr_missed_equiv = (m.FN / (m.TP + m.FN)) if (m.TP + m.FN) else None
    prevalence_equiv = (m.TP + m.FN) / n if n else None

    lines_out.append("LABEL PREVALENCE (gold)")
    lines_out.append("-" * 78)
    lines_out.append(
        f"prevalence_equivalent:      {_fmt_pct(prevalence_equiv)}  "
        f"# fraction of gold labels that are EQUIVALENT (supports interpreting accuracy)"
    )
    lines_out.append(
        f"prevalence_behavioral:      {_fmt_pct((1.0 - prevalence_equiv) if prevalence_equiv is not None else None)}  "
        f"# fraction of gold labels that are BEHAVIORAL_CHANGE"
    )
    lines_out.append("")

    lines_out.append("ACCURACY & CLASS-BALANCED VARIANTS")
    lines_out.append("-" * 78)
    acc = accuracy(m)
    lines_out.append(
        f"accuracy:                   {_fmt_pct(acc)}  "
        f"# (TP+TN)/N — overall agreement; can be inflated by majority class"
    )

    spec = recall_behavioral(m)
    sens = recall_equiv(m)
    balanced_acc = None
    if sens is not None and spec is not None:
        balanced_acc = (sens + spec) / 2.0
    lines_out.append(
        f"balanced_accuracy:          {_fmt_pct(balanced_acc)}  "
        f"# mean(sensitivity_equiv, specificity): avg per-class recall; "
        f"less fooled by imbalance than accuracy"
    )
    lines_out.append(
        f"sensitivity (recall_equiv): {_fmt_pct(sens)}  "
        f"# TP/(TP+FN) — among true equivalents, fraction predicted equivalent"
    )
    lines_out.append(
        f"specificity:                {_fmt_pct(spec)}  "
        f"# TN/(TN+FP) — among true behavioral rows, fraction predicted behavioral"
    )
    lines_out.append(
        f"FPR (false equiv rate):     {_fmt_pct(fpr_equiv_pred_on_behav_gold)}  "
        f"# FP/(FP+TN) — among behavioral mutants, fraction wrongly called equivalent"
    )
    lines_out.append(
        f"FNR (missed equiv rate):    {_fmt_pct(fnr_missed_equiv)}  "
        f"# FN/(TP+FN) — among equivalent mutants, fraction wrongly called behavioral"
    )
    lines_out.append("")

    prec_e = precision_equiv(m)
    rec_e = recall_equiv(m)
    f1_e = f1_score(prec_e, rec_e)
    prec_b = precision_behavioral(m)
    rec_b = recall_behavioral(m)
    f1_b = f1_score(prec_b, rec_b)

    lines_out.append("PRECISION / RECALL / F1 (class EQUIVALENT)")
    lines_out.append("-" * 78)
    lines_out.append(
        f"precision_equiv:            {_fmt_pct(prec_e)}  "
        f"# TP/(TP+FP) — when model says EQUIVALENT, how often gold was EQUIVALENT"
    )
    lines_out.append(
        f"recall_equiv:               {_fmt_pct(rec_e)}  "
        f"# TP/(TP+FN) — same as sensitivity above"
    )
    lines_out.append(
        f"f1_equiv:                   {_fmt_pct(f1_e)}  "
        f"# harmonic mean of precision_equiv and recall_equiv"
    )
    lines_out.append("")

    lines_out.append("PRECISION / RECALL / F1 (class BEHAVIORAL_CHANGE)")
    lines_out.append("-" * 78)
    lines_out.append(
        f"precision_behavioral:       {_fmt_pct(prec_b)}  "
        f"# TN/(TN+FN) — when model says BEHAVIORAL_CHANGE, how often gold agreed"
    )
    lines_out.append(
        f"recall_behavioral:          {_fmt_pct(rec_b)}  "
        f"# TN/(TN+FP) — among behavioral gold rows, fraction predicted behavioral"
    )
    lines_out.append(
        f"f1_behavioral:              {_fmt_pct(f1_b)}  "
        f"# harmonic mean for behavioral class"
    )
    lines_out.append("")

    macro_f1 = None
    if f1_e is not None and f1_b is not None:
        macro_f1 = (f1_e + f1_b) / 2.0
    lines_out.append("AGGREGATE F1")
    lines_out.append("-" * 78)
    lines_out.append(
        f"macro_f1:                   {_fmt_pct(macro_f1)}  "
        f"# unweighted mean of f1_equiv and f1_behavioral — treats both classes equally"
    )
    lines_out.append("")

    kap = cohens_kappa(m)
    mc = mcc(m)
    score_gepa = kappa_with_fp_penalty(m, lam=lambda_fp)

    lines_out.append("AGREEMENT & CORRELATION METRICS")
    lines_out.append("-" * 78)
    lines_out.append(
        f"cohens_kappa:               {_fmt_float(kap, 6)}  "
        f"# chance-corrected agreement vs gold (margins); ∈ [-1,1], "
        f"interpret like correlation for raters"
    )
    lines_out.append(
        f"mcc:                        {_fmt_float(mc, 6)}  "
        f"# Matthews correlation — uses all four confusion cells; "
        f"±1 perfect, 0 ~ random"
    )
    lines_out.append(
        f"gepa_score_kappa_minus_lambda_fp: {_fmt_float(score_gepa, 6)}  "
        f"# κ − ({lambda_fp})×(FP/N); optimization objective in simple_gepa "
        f"(extra cost on false equivalents)"
    )
    lines_out.append(
        f"lambda_fp_used:             {lambda_fp:<6}  "
        f"# multiplier on FP/N in gepa_score above (override with --lambda-fp)"
    )
    lines_out.append("")

    lines_out.append("USAGE / COST (only if JSONL rows contained token fields)")
    lines_out.append("-" * 78)
    lines_out.append(
        f"sum_input_tokens:           {in_prompt:<6}  "
        f"# summed prompt tokens across parsed rows (0 if not logged)"
    )
    lines_out.append(
        f"sum_output_tokens:          {in_completion:<6}  "
        f"# summed completion tokens across parsed rows (0 if not logged)"
    )
    lines_out.append(
        f"sum_tokens:                 {in_prompt + in_completion:<6}  "
        f"# prompt + completion totals where integers were present"
    )
    if latencies:
        lines_out.append(
            f"latency_ms_mean:            {_fmt_float(statistics.mean(latencies), 2)}  "
            f"# mean latencyMs where present"
        )
        lines_out.append(
            f"latency_ms_median:          {_fmt_float(statistics.median(latencies), 2)}  "
            f"# median latencyMs"
        )
    else:
        lines_out.append(
            "latency_ms_mean:            n/a   # no integer latencyMs fields in rows"
        )
    lines_out.append("")
    lines_out.append("=" * 78)

    return lines_out, m, counters


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "jsonl",
        type=str,
        help="Path to classification JSONL (e.g. runs/*.jsonl from run_validation.py)",
    )
    p.add_argument(
        "--lambda-fp",
        type=float,
        default=0.5,
        help="λ in κ − λ·FP/N (default 0.5, match simple_gepa)",
    )
    p.add_argument(
        "--out",
        type=str,
        default=None,
        help="Write report to this file as well as stdout",
    )
    return p.parse_args()


def main() -> int:
    args = parse_args()
    path = Path(args.jsonl).expanduser().resolve()
    if not path.is_file():
        print(f"File not found: {path}", file=sys.stderr)
        return 1

    report_lines, _, _ = summarize_jsonl(path, lambda_fp=args.lambda_fp)
    text = "\n".join(report_lines) + "\n"
    sys.stdout.write(text)
    if args.out:
        outp = Path(args.out).expanduser().resolve()
        outp.parent.mkdir(parents=True, exist_ok=True)
        outp.write_text(text, encoding="utf-8")
        print(f"\n[Written {outp}]", file=sys.stderr)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
