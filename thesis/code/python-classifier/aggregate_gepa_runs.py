#!/usr/bin/env python3
"""Merge ``generations.jsonl`` from multiple GEPA experiment folders for offline plots.

Example::

    python aggregate_gepa_runs.py \\
        experiments/simple_gepa_20260511_120000 \\
        experiments/simple_gepa_20260511_180000 \\
        --output analysis/merged_generations.jsonl

Each source line is copied with an extra field ``source_experiment_id`` taken from
``run_metadata.json`` when present.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def main() -> int:
    p = argparse.ArgumentParser(description="Merge GEPA generations.jsonl across runs")
    p.add_argument("experiment_dirs", nargs="+", help="Paths to experiments/simple_gepa_* dirs")
    p.add_argument("--output", "-o", required=True, help="Output JSONL path")
    args = p.parse_args()

    out_path = Path(args.output).expanduser().resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)

    n = 0
    with out_path.open("w", encoding="utf-8") as out:
        for d in args.experiment_dirs:
            exp = Path(d).expanduser().resolve()
            meta_path = exp / "run_metadata.json"
            gj = exp / "generations.jsonl"
            if not gj.is_file():
                print(f"Skip (no generations.jsonl): {gj}", file=sys.stderr)
                continue
            meta = {}
            if meta_path.is_file():
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
            exp_id = meta.get("experiment_id", exp.name)

            for line in gj.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if not line:
                    continue
                obj = json.loads(line)
                obj["source_experiment_id"] = exp_id
                obj["source_run_label"] = meta.get("run_label")
                out.write(json.dumps(obj, ensure_ascii=False) + "\n")
                n += 1

    print(f"Wrote {n} merged rows to {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
