"""Loss functions and sampler helpers."""

from __future__ import annotations

import pandas as pd
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader, Dataset, WeightedRandomSampler


LOSS_CHOICES = ("ce", "ce_weighted", "focal")


class FocalLoss(nn.Module):
    """Multi-class focal loss with optional class-weight alpha.

    L = (1 - p_t)^gamma * CE(logits, target).
    """

    def __init__(
        self,
        *,
        gamma: float = 2.0,
        alpha: torch.Tensor | None = None,
        label_smoothing: float = 0.0,
    ) -> None:
        super().__init__()
        self.gamma = gamma
        self.alpha = alpha
        self.label_smoothing = label_smoothing

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        ce = F.cross_entropy(
            logits,
            targets,
            weight=self.alpha,
            reduction="none",
            label_smoothing=float(self.label_smoothing),
        )
        pt = torch.exp(-ce)
        focal = ((1.0 - pt) ** self.gamma) * ce
        return focal.mean()


def make_criterion(
    loss_name: str,
    *,
    class_weight: torch.Tensor,
    focal_gamma: float,
    label_smoothing: float = 0.0,
) -> nn.Module:
    """Build the loss function used in training."""
    ls = float(label_smoothing)
    if loss_name == "ce":
        return nn.CrossEntropyLoss(label_smoothing=ls)
    if loss_name == "ce_weighted":
        return nn.CrossEntropyLoss(weight=class_weight, label_smoothing=ls)
    if loss_name == "focal":
        return FocalLoss(gamma=focal_gamma, alpha=class_weight, label_smoothing=ls)
    raise ValueError(f"Unknown loss {loss_name!r}; expected one of {LOSS_CHOICES}")


def make_train_loader(
    dataset: Dataset,
    labels: pd.Series,
    *,
    batch_size: int,
    balanced_sampler: bool,
) -> DataLoader:
    """Return a DataLoader that either shuffles uniformly or uses a class-balanced sampler."""
    if not balanced_sampler:
        return DataLoader(dataset, batch_size=batch_size, shuffle=True, num_workers=0)
    counts = labels.value_counts().to_dict()
    weights = [1.0 / float(counts[int(lbl)]) for lbl in labels.tolist()]
    sampler = WeightedRandomSampler(weights, num_samples=len(labels), replacement=True)
    return DataLoader(dataset, batch_size=batch_size, sampler=sampler, num_workers=0)
