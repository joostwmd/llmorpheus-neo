"""PyTorch Dataset: mutant pairs → UniXCoder inputs."""

from __future__ import annotations

from pathlib import Path

import pandas as pd
import torch
from torch.utils.data import Dataset
from transformers import PreTrainedTokenizerBase

from context import pair_text_for_model


class MutantDataset(Dataset):
    def __init__(
        self,
        csv_path: Path | str,
        tokenizer: PreTrainedTokenizerBase,
        *,
        max_length: int,
        window_or_full: int | str,
        input_format: str = "pair",
        df: pd.DataFrame | None = None,
    ) -> None:
        """``df`` lets callers (e.g. CV) pass a pre-sliced DataFrame instead of re-reading a CSV."""
        self.df = df.reset_index(drop=True).copy() if df is not None else pd.read_csv(csv_path)
        if "label" not in self.df.columns:
            if "coding" not in self.df.columns:
                raise ValueError(f"{csv_path}: need `label` or `coding` column for MutantDataset")
            lm = {"Equivalent": 1, "Behavioral Change": 0}
            self.df["label"] = self.df["coding"].map(lm)
            if self.df["label"].isna().any():
                raise ValueError(f"{csv_path}: unexpected values in `coding` column")
        self.tokenizer = tokenizer
        self.max_length = max_length
        self.window_or_full = window_or_full
        self.input_format = input_format

        self._truncated_pre_truncation = 0
        self._pairs: list[tuple[str, str, int]] = []
        self._prefetch_pairs()

    def _tokenize(self, text_a: str, text_b: str, *, truncation: bool, padding):
        if text_b == "" or text_b is None:
            return self.tokenizer(
                text_a,
                max_length=self.max_length,
                padding=padding,
                truncation=truncation,
                return_attention_mask=True,
                return_tensors=("pt" if padding else None),
            )
        return self.tokenizer(
            text_a,
            text_b,
            max_length=self.max_length,
            padding=padding,
            truncation=truncation,
            return_attention_mask=True,
            return_tensors=("pt" if padding else None),
        )

    def _would_truncate(self, text_a: str, text_b: str) -> bool:
        if text_b == "" or text_b is None:
            enc = self.tokenizer(text_a, truncation=False, padding=False, return_attention_mask=False)
        else:
            enc = self.tokenizer(text_a, text_b, truncation=False, padding=False, return_attention_mask=False)
        return len(enc["input_ids"]) > self.max_length

    def _prefetch_pairs(self) -> None:
        for idx in range(len(self.df)):
            row = self.df.iloc[idx].to_dict()
            try:
                a, b = pair_text_for_model(row, self.window_or_full, self.input_format)
            except Exception as err:  # noqa: BLE001
                raise RuntimeError(f"Row {idx} (id={row.get('id')}): context extraction failed: {err}") from err
            label = int(row["label"])
            if self._would_truncate(a, b):
                self._truncated_pre_truncation += 1
            self._pairs.append((a, b, label))

    @property
    def truncated_count(self) -> int:
        return self._truncated_pre_truncation

    def __len__(self) -> int:
        return len(self._pairs)

    def __getitem__(self, idx: int) -> dict[str, torch.Tensor]:
        text_a, text_b, label = self._pairs[idx]
        enc = self._tokenize(text_a, text_b, truncation=True, padding="max_length")
        return {
            "input_ids": enc["input_ids"].squeeze(0),
            "attention_mask": enc["attention_mask"].squeeze(0),
            "label": torch.tensor(label, dtype=torch.long),
        }
