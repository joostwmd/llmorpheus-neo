#!/usr/bin/env python3
"""
Batch classify a labeled CSV (default: data/validation.csv); append JSONL to runs/.

Usage:
  cd thesis/code/python-classifier
  pip install -r requirements.txt
  export OPENAI_API_KEY=...
  python run_validation.py
  python run_validation.py --split test --window 10
  python run_validation.py --csv data/custom.csv --limit 5
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

from classifier import classify_row, context_config_label, make_classifier, require_env_for_task_model
from evaluation import (
    build_confusion_matrix,
    format_report,
    load_labeled_csv,
    normalize_ground_truth_label,
    normalize_prediction_label,
)

PACKAGE_ROOT = Path(__file__).resolve().parent


def sanitize_filename_segment(segment: object) -> str:
    s = str(segment or "unknown").strip()
    s = re.sub(r'[/\\:*?"<>|]+', "-", s)
    s = re.sub(r"\s+", "-", s)[:80]
    return s or "unknown"


def utc_filename_timestamp(d: datetime | None = None) -> str:
    d = d or datetime.now(timezone.utc)
    return d.isoformat().replace(":", "-").replace(".", "-")


def build_run_log_filename(
    *,
    model: str,
    template_kind: str,
    template_version: str,
    context_label: str,
    dataset_tag: str | None,
    date: datetime | None = None,
) -> str:
    dt = utc_filename_timestamp(date)
    tpl = f"{sanitize_filename_segment(template_kind)}-{sanitize_filename_segment(template_version)}"
    base = f"{dt}_{sanitize_filename_segment(model)}_{tpl}_{sanitize_filename_segment(context_label)}"
    tag = ""
    if dataset_tag is not None and str(dataset_tag).strip():
        tag = f"_{sanitize_filename_segment(dataset_tag)}"
    return f"{base}{tag}.jsonl"


def meta_split_for_csv(csv_path: Path) -> str:
    base = csv_path.name.lower()
    if base == "test.csv":
        return "test"
    if base == "validation.csv":
        return "validation"
    return "custom"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Run equivalent mutant classifier on labeled CSV.")
    p.add_argument("--split", choices=("validation", "test"), default="validation")
    p.add_argument("--csv", type=str, default=None, help="Override CSV path")
    p.add_argument("--window", type=int, default=20)
    p.add_argument("--full", action="store_true", help="Use full-file context")
    # Template system removed - using hardcoded prompt
    p.add_argument("--limit", type=int, default=None)
    p.add_argument("--fail-fast", action="store_true")
    p.add_argument(
        "--model",
        default=os.environ.get("CLASSIFIER_MODEL", "openrouter/openai/gpt-4o-mini"),
        help="Model id: openrouter/... (OPENROUTER_API_KEY) or gpt-4o-mini / gpt-4o (OPENAI_API_KEY)",
    )
    p.add_argument("--no-summary", action="store_true", help="Skip printing metrics summary")
    return p.parse_args()


def main() -> int:
    args = parse_args()

    try:
        require_env_for_task_model(args.model)
    except RuntimeError as e:
        print(str(e), file=sys.stderr)
        return 1

    csv_path = (
        Path(args.csv).expanduser().resolve()
        if args.csv
        else PACKAGE_ROOT / "data" / ("test.csv" if args.split == "test" else "validation.csv")
    )
    if not csv_path.is_file():
        print(f"CSV not found: {csv_path}", file=sys.stderr)
        return 1

    rows = load_labeled_csv(csv_path)
    if args.limit is not None:
        rows = rows[: max(0, args.limit)]

    window_or_full: int | str = "full" if args.full else args.window
    classifier = make_classifier(args.model)

    template_kind = "hardcoded"
    template_version = "inline"

    dataset_tag = csv_path.stem or "data"
    split_meta = meta_split_for_csv(csv_path)

    runs_dir = PACKAGE_ROOT / "runs"
    runs_dir.mkdir(parents=True, exist_ok=True)
    started_at = datetime.now(timezone.utc)
    context_label_cfg = context_config_label(window_or_full)

    file_path = runs_dir / build_run_log_filename(
        model=args.model,
        template_kind=template_kind,
        template_version=template_version,
        context_label=context_label_cfg,
        dataset_tag=dataset_tag,
        date=started_at,
    )

    rel_csv = csv_path
    try:
        rel_csv = csv_path.relative_to(PACKAGE_ROOT)
    except ValueError:
        pass

    print(
        f"Batch classify: {rel_csv} ({len(rows)} row(s)) | model={args.model} | "
        f"{template_kind}/{template_version} | context={context_label_cfg}"
    )

    ok = 0
    failures: list[tuple[int, str, str]] = []
    predictions: list[str] = []

    for i, row in enumerate(rows):
        n = i + 1
        label = f"{row.get('project')} {row.get('file')}:{row.get('line')} (id={row.get('id')})"
        try:
            result, ctx = classify_row(classifier, row, window_or_full)
            predictions.append(result.classification)

            record = {
                "provider": "openrouter" if args.model.startswith("openrouter/") else "openai",
                "model": args.model,
                "templateKind": template_kind,
                "templateVersion": template_version,
                "promptHash": result.prompt_hash,
                "project": row.get("project"),
                "file": row.get("file"),
                "line": row.get("line"),
                "split": split_meta,
                "mutantId": row.get("id"),
                "snippetLineCount": len(ctx["lines"]),
                "groundTruthLabel": row.get("coding"),
                "classification": result.classification,
                "reasoning": result.reasoning,
                "inputTokens": result.input_tokens,
                "outputTokens": result.output_tokens,
                "totalTokens": result.total_tokens,
                "latencyMs": result.latency_ms,
                "finishReason": "stop",
                "retries": 0,
                "contextLabel": context_label_cfg,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            with open(file_path, "a", encoding="utf-8") as f:
                f.write(json.dumps(record, ensure_ascii=False) + "\n")

            ok += 1
            print(f"[{n}/{len(rows)}] OK {label} -> {result.classification}")
        except Exception as e:  # noqa: BLE001
            msg = str(e)
            failures.append((n, label, msg))
            print(f"[{n}/{len(rows)}] FAIL {label}: {msg}", file=sys.stderr)
            if args.fail_fast:
                return 1

    print(f"\nDone: {ok}/{len(rows)} succeeded, {len(failures)} failed.")
    print(f"Log file: {file_path}")

    if not args.no_summary and len(predictions) == len(rows) and predictions:
        pairs: list[tuple[str, str]] = []
        for row, pred in zip(rows, predictions, strict=True):
            gold = normalize_ground_truth_label(row.get("coding"))
            pr = normalize_prediction_label(pred)
            if gold and pr:
                pairs.append((gold, pr))
        m = build_confusion_matrix(pairs)
        print("\n" + format_report(m))

    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
