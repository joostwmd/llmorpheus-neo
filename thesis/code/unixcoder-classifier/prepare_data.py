#!/usr/bin/env python3
"""Build stratified train/validation splits from the LLMorpheus gold CSV."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

PACKAGE_ROOT = Path(__file__).resolve().parent
DATA_DIR = PACKAGE_ROOT / "data"
SOURCE_CSV = PACKAGE_ROOT.parent / "python-classifier" / "data" / "all-coded-mutants-final.csv"


def stratified_train_val(df: pd.DataFrame, *, val_frac: float, seed: int) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Approximate stratified split without sklearn."""
    rng = np.random.default_rng(seed)
    train_parts: list[pd.DataFrame] = []
    val_parts: list[pd.DataFrame] = []
    for lbl in sorted(df["label"].unique()):
        sub = df[df["label"] == lbl]
        idx = np.array(sub.index.to_numpy(), copy=True)
        rng.shuffle(idx)
        n = len(idx)
        if n <= 1:
            train_parts.append(df.loc[idx])
            continue
        n_val = int(round(n * val_frac))
        if n_val <= 0 and n > 1:
            n_val = 1
        if n_val >= n:
            n_val = max(1, n - 1)
        val_parts.append(df.loc[idx[:n_val]])
        train_parts.append(df.loc[idx[n_val:]])
    train_df = pd.concat(train_parts).sample(frac=1.0, random_state=seed)
    val_df = pd.concat(val_parts).sample(frac=1.0, random_state=seed)
    return train_df, val_df


def main() -> None:
    if not SOURCE_CSV.is_file():
        raise FileNotFoundError(
            f"Gold dataset not found: {SOURCE_CSV}\n"
            "Expected thesis/code/python-classifier/data/all-coded-mutants-final.csv"
        )

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    df = pd.read_csv(SOURCE_CSV)
    label_map = {"Equivalent": 1, "Behavioral Change": 0}
    df["label"] = df["coding"].map(label_map)
    if df["label"].isna().any():
        bad = df.loc[df["label"].isna(), "coding"].unique().tolist()
        raise ValueError(f"Unexpected coding labels (need Equivalent / Behavioral Change): {bad}")

    out_all = DATA_DIR / "all.csv"
    df.to_csv(out_all, index=False)
    print(f"Wrote {out_all} ({len(df)} rows)")

    train_df, val_df = stratified_train_val(df, val_frac=0.20, seed=42)

    train_path = DATA_DIR / "training.csv"
    val_path = DATA_DIR / "validation.csv"
    train_df.to_csv(train_path, index=False)
    val_df.to_csv(val_path, index=False)

    print(f"Training:   {train_path} ({len(train_df)} rows)")
    print(f"Validation: {val_path} ({len(val_df)} rows)")
    for name, part in ("train", train_df), ("val", val_df):
        eq = int((part["label"] == 1).sum())
        ne = int((part["label"] == 0).sum())
        print(f"  {name}: equivalent={eq}, non-equivalent={ne}")


if __name__ == "__main__":
    main()
