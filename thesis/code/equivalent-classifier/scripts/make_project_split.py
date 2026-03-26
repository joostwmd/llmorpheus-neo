#!/usr/bin/env python3
"""Split all-coded-mutants-final.csv by project (no row-level leakage).

Writes:
  data/validation.csv — prompt / model iteration
  data/test.csv       — final metrics after freezing setup
  data/split-manifest.json — seed, project lists, row counts
"""
from __future__ import annotations

import csv
import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SRC = DATA / "all-coded-mutants-final.csv"
SEED = 42
VALIDATION_FRACTION = 0.28


def main() -> None:
    rows: list[dict[str, str]] = []
    with SRC.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        assert fieldnames is not None
        for row in reader:
            rows.append(row)

    projects = sorted({r["project"] for r in rows})
    rng = random.Random(SEED)
    shuffled = projects[:]
    rng.shuffle(shuffled)
    n_val = max(1, round(len(shuffled) * VALIDATION_FRACTION))
    val_projects = set(shuffled[:n_val])
    test_projects = set(shuffled[n_val:])

    val_rows = [r for r in rows if r["project"] in val_projects]
    test_rows = [r for r in rows if r["project"] in test_projects]

    def write_csv(path: Path, data: list[dict[str, str]], fieldnames: list[str]) -> None:
        with path.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=fieldnames, quoting=csv.QUOTE_MINIMAL)
            w.writeheader()
            w.writerows(data)

    fieldnames = list(rows[0].keys()) if rows else []
    write_csv(DATA / "validation.csv", val_rows, fieldnames)
    write_csv(DATA / "test.csv", test_rows, fieldnames)

    manifest = {
        "seed": SEED,
        "validation_project_fraction": VALIDATION_FRACTION,
        "validation_projects": sorted(val_projects),
        "test_projects": sorted(test_projects),
        "row_counts": {
            "full": len(rows),
            "validation": len(val_rows),
            "test": len(test_rows),
        },
    }
    (DATA / "split-manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
