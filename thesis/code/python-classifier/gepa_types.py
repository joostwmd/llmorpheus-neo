"""Simple configuration for GEPA experiments.

Since we removed the template system and now use hardcoded prompts,
we only need basic configuration types.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any


@dataclass
class GEPAConfig:
    """Configuration for GEPA experiments with hardcoded prompts."""

    # Stratified validation subset
    validation_csv_path: str = "data/validation.csv"
    n_equivalent: int = 20
    n_behavioral: int = 60
    validation_subset_seed: int = 42

    # GEPA engine
    max_generations: int = 150
    reflection_model: str = "gpt-4o"
    seed: int = 42

    # Task LM
    classifier_model: str = "gpt-4o-mini"

    # Context window (NOT optimized by GEPA; selected via window_sensitivity.py)
    context_window: int | str = 10

    # Scoring
    lambda_fp: float = 0.5      # FP penalty weight in score = kappa - lambda_fp * (FP / N)
    max_diagnostics_per_class: int = 10

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)