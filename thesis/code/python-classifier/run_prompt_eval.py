#!/usr/bin/env python3
"""
Batch-classify a labeled CSV with an explicit prompt template (e.g. GEPA ``best_prompt.txt``).

Unlike ``run_validation.py``, this does not use ``get_hardcoded_prompt()`` — you must pass
``--prompt-file`` or ``--prompt``. Placeholders: ``{{original}}``, ``{{replacement}}``, ``{{context}}``.

Outputs JSONL under ``runs/`` (same shape as ``run_validation.py``) so you can run
``summarize_classification_run.py`` on the log.

Examples:
  export OPENROUTER_API_KEY=...
  python run_prompt_eval.py \\
    --prompt-file runs/gepa-baseline-1-window-50-25762142261/best_prompt.txt \\
    --model openrouter/google/gemini-2.5-flash \\
    --window 50 \\
    --split validation

  python run_prompt_eval.py --prompt-file path/to/best_prompt.txt --split test --window 50
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from classifier import (
    classify_row_with_prompt_template,
    context_config_label,
    make_classifier,
    require_env_for_task_model,
)
from evaluation import (
    build_confusion_matrix,
    format_report,
    load_labeled_csv,
    normalize_ground_truth_label,
    normalize_prediction_label,
)
from run_validation import (
    build_run_log_filename,
    meta_split_for_csv,
)

PACKAGE_ROOT = Path(__file__).resolve().parent


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--split",
        choices=("validation", "test"),
        default="validation",
        help="Labeled CSV under data/ (default: validation — evaluation set)",
    )
    p.add_argument("--csv", type=str, default=None, help="Override CSV path")
    p.add_argument("--window", type=int, default=20)
    p.add_argument("--full", action="store_true", help="Use full-file context")
    p.add_argument("--limit", type=int, default=None)
    p.add_argument("--fail-fast", action="store_true")
    p.add_argument("--no-summary", action="store_true")
    p.add_argument(
        "--model",
        default=os.environ.get("CLASSIFIER_MODEL", "openrouter/openai/gpt-4o-mini"),
        help="Same model ids as run_validation.py",
    )
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument(
        "--prompt-file",
        type=str,
        help="Path to prompt template (with {{original}}, {{replacement}}, {{context}})",
    )
    g.add_argument(
        "--prompt",
        type=str,
        help="Inline prompt template (prefer --prompt-file for long prompts)",
    )
    return p.parse_args()


def load_prompt_template(args: argparse.Namespace) -> tuple[str, str]:
    if args.prompt_file:
        path = Path(args.prompt_file).expanduser().resolve()
        if not path.is_file():
            print(f"Prompt file not found: {path}", file=sys.stderr)
            raise SystemExit(1)
        return path.read_text(encoding="utf-8"), str(path)
    assert args.prompt is not None
    return args.prompt, "cli-inline"


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

    prompt_template, prompt_source = load_prompt_template(args)
    for needle in ("{{original}}", "{{replacement}}", "{{context}}"):
        if needle not in prompt_template:
            print(
                f"Warning: prompt missing {needle!r} — placeholder will stay empty if absent.",
                file=sys.stderr,
            )

    rows = load_labeled_csv(csv_path)
    if args.limit is not None:
        rows = rows[: max(0, args.limit)]

    window_or_full: int | str = "full" if args.full else args.window
    classifier = make_classifier(args.model)

    prompt_sha256 = hashlib.sha256(prompt_template.encode("utf-8")).hexdigest()
    template_kind = "prompt_file" if args.prompt_file else "prompt_inline"
    template_version = prompt_sha256[:16]

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

    meta_path = file_path.with_suffix(".meta.json")
    rel_csv = csv_path
    try:
        rel_csv = csv_path.relative_to(PACKAGE_ROOT)
    except ValueError:
        pass

    meta_path.write_text(
        json.dumps(
            {
                "script": "run_prompt_eval.py",
                "started_at": started_at.isoformat(),
                "csv": str(rel_csv),
                "split_meta": split_meta,
                "model": args.model,
                "prompt_source": prompt_source,
                "prompt_sha256": prompt_sha256,
                "context": context_label_cfg,
                "row_count": len(rows),
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    print(
        f"Prompt eval: {rel_csv} ({len(rows)} row(s)) | model={args.model} | "
        f"context={context_label_cfg}\n"
        f"Prompt: {prompt_source}\n"
        f"prompt_sha256={prompt_sha256}\n"
        f"JSONL: {file_path}\n"
        f"Meta:  {meta_path}"
    )

    ok = 0
    failures: list[tuple[int, str, str]] = []
    metric_pairs: list[tuple[str, str]] = []

    for i, row in enumerate(rows):
        n = i + 1
        label = f"{row.get('project')} {row.get('file')}:{row.get('line')} (id={row.get('id')})"
        try:
            result, ctx = classify_row_with_prompt_template(
                classifier, row, window_or_full, prompt_template
            )

            gold = normalize_ground_truth_label(row.get("coding"))
            pr = normalize_prediction_label(result.classification)
            if gold and pr:
                metric_pairs.append((gold, pr))

            record = {
                "provider": "openrouter" if args.model.startswith("openrouter/") else "openai",
                "model": args.model,
                "templateKind": template_kind,
                "templateVersion": template_version,
                "promptSource": prompt_source,
                "promptSha256": prompt_sha256,
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

    if not args.no_summary and metric_pairs:
        m = build_confusion_matrix(metric_pairs)
        print("\n" + format_report(m))
        if ok < len(rows):
            print(
                f"\n(Metrics from {len(metric_pairs)} successful rows only; "
                f"{len(rows) - ok} row(s) failed.)",
                file=sys.stderr,
            )

    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
