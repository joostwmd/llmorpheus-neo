#!/usr/bin/env python3
"""Smoke tests: context extraction (no API) and optional live classify (OpenAI or OpenRouter)."""

from __future__ import annotations

import os
import sys
from pathlib import Path

PACKAGE_ROOT = Path(__file__).resolve().parent


def test_extract_context() -> None:
    from classifier import extract_context

    csv_path = PACKAGE_ROOT / "data" / "validation.csv"
    assert csv_path.is_file(), f"Missing {csv_path}"

    import csv as csv_module

    with csv_path.open(encoding="utf-8") as f:
        reader = csv_module.DictReader(f)
        row = next(reader)

    ctx = extract_context(row["project"], row["file"], int(row["line"]), window_or_full=10)
    assert ctx["scope"] == "window"
    assert "annotatedText" in ctx and ">>>" in ctx["annotatedText"]
    print("extract_context: OK")


def test_live_classify(limit: int = 2) -> None:
    from classifier import classify_row, make_classifier, require_env_for_task_model

    model = os.environ.get("CLASSIFIER_MODEL", "gpt-4o-mini")
    try:
        require_env_for_task_model(model)
    except RuntimeError as e:
        print(f"{e} — skipping live classify")
        return

    from evaluation import load_labeled_csv

    rows = load_labeled_csv(PACKAGE_ROOT / "data" / "validation.csv")[:limit]
    clf = make_classifier(model)

    for row in rows:
        result, _ctx = classify_row(clf, row, window_or_full=10)
        print(f"id={row.get('id')} gold={row.get('coding')} -> {result.classification}")
    print("live classify: OK")


def main() -> int:
    os.chdir(PACKAGE_ROOT)
    sys.path.insert(0, str(PACKAGE_ROOT))

    test_extract_context()
    test_live_classify(limit=int(os.environ.get("SMOKE_LIMIT", "2")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
