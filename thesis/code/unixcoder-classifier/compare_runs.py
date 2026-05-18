#!/usr/bin/env python3
"""Print a Markdown table summarizing metrics across ``runs/*/metrics.json``."""

from __future__ import annotations

import json
from pathlib import Path

PACKAGE_ROOT = Path(__file__).resolve().parent
RUNS_DIR = PACKAGE_ROOT / "runs"


def main() -> None:
    rows = []
    if not RUNS_DIR.is_dir():
        print(f"No runs directory: {RUNS_DIR}")
        return

    for run_dir in sorted(RUNS_DIR.iterdir()):
        if not run_dir.is_dir():
            continue
        mp = run_dir / "metrics.json"
        cp = run_dir / "config.json"
        if not mp.is_file():
            continue
        metrics = json.loads(mp.read_text(encoding="utf-8"))
        cfg = json.loads(cp.read_text(encoding="utf-8")) if cp.is_file() else {}
        cm = metrics.get("confusion_matrix", {})
        rows.append(
            {
                "run": run_dir.name,
                "window": cfg.get("window", ""),
                "mode": "frozen" if cfg.get("frozen_encoder", True) else "full-ft",
                "epochs": cfg.get("epochs", ""),
                "macro_f1": metrics.get("macro_f1"),
                "kappa": metrics.get("kappa"),
                "mcc": metrics.get("mcc"),
                "accuracy": metrics.get("accuracy"),
                "TP": cm.get("TP"),
                "FN": cm.get("FN"),
                "FP": cm.get("FP"),
                "TN": cm.get("TN"),
            }
        )

    if not rows:
        print(f"No metrics.json files under {RUNS_DIR}")
        return

    rows.sort(key=lambda r: float("-inf") if r["macro_f1"] is None else -float(r["macro_f1"]))

    cols = ["run", "window", "mode", "epochs", "macro_f1", "kappa", "mcc", "accuracy", "TP", "FP", "FN", "TN"]
    print("| " + " | ".join(cols) + " |")
    print("| " + " | ".join("---" for _ in cols) + " |")
    for r in rows:
        cells = []
        for c in cols:
            v = r.get(c)
            if isinstance(v, float):
                cells.append(f"{v:.4f}")
            elif v is None:
                cells.append("")
            else:
                cells.append(str(v))
        print("| " + " | ".join(cells) + " |")


if __name__ == "__main__":
    main()
