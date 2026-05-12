"""Deterministic stratified subsetting of the labeled mutant dataset.

Used by both the window-sensitivity pipeline and the GEPA evaluator so that every
candidate (and every window) is judged against the *same* fixed set of mutants.
A local Random instance avoids touching the global RNG.
"""

from __future__ import annotations

import random
from pathlib import Path
from typing import Iterable

from evaluation import load_labeled_csv, normalize_ground_truth_label


def split_by_label(rows: Iterable[dict[str, str]]) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    """Partition rows by normalized ground-truth label, skipping unparseable rows."""
    equivalents: list[dict[str, str]] = []
    behavioral: list[dict[str, str]] = []
    for r in rows:
        g = normalize_ground_truth_label(r.get("coding"))
        if g == "EQUIVALENT":
            equivalents.append(r)
        elif g == "BEHAVIORAL_CHANGE":
            behavioral.append(r)
    return equivalents, behavioral


def stratified_subset(
    csv_path: Path | str,
    n_equivalent: int = 20,
    n_behavioral: int = 60,
    seed: int = 42,
) -> list[dict[str, str]]:
    """Return a deterministic, class-stratified subset of the labeled CSV.

    Parameters
    ----------
    csv_path
        CSV with at least the columns: project, file, line, original, replacement, coding.
    n_equivalent / n_behavioral
        Target count per class. Clamped to what's available; the function never raises
        if the class has fewer rows.
    seed
        Seed for a *local* random.Random instance (does not touch global RNG).
    """
    rows = load_labeled_csv(Path(csv_path))
    equivalents, behavioral = split_by_label(rows)

    rng = random.Random(seed)
    rng.shuffle(equivalents)
    rng.shuffle(behavioral)

    eq_take = min(n_equivalent, len(equivalents))
    beh_take = min(n_behavioral, len(behavioral))
    subset = equivalents[:eq_take] + behavioral[:beh_take]
    rng.shuffle(subset)  # interleave classes; classifier behavior shouldn't depend on row order
    return subset
