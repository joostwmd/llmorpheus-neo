"""UniXCoder encoder + small classifier head."""

from __future__ import annotations

import torch
from torch import nn
from transformers import AutoModel


MODEL_NAME_DEFAULT = "microsoft/unixcoder-base"
POOLINGS = ("cls", "cls_mean_max")


class UniXCoderClassifier(nn.Module):
    def __init__(
        self,
        encoder: AutoModel,
        *,
        frozen_encoder: bool,
        pooling: str = "cls",
        head_hidden: int = 256,
        head_dropout: float = 0.1,
    ) -> None:
        super().__init__()
        if pooling not in POOLINGS:
            raise ValueError(f"Unknown pooling {pooling!r}; expected one of {POOLINGS}")
        self.encoder = encoder
        self.frozen_encoder = frozen_encoder
        self.pooling = pooling
        hidden = encoder.config.hidden_size
        if frozen_encoder:
            for p in self.encoder.parameters():
                p.requires_grad = False
        in_dim = hidden if pooling == "cls" else hidden * 3
        self.classifier = nn.Sequential(
            nn.Dropout(head_dropout),
            nn.Linear(in_dim, head_hidden),
            nn.GELU(),
            nn.Dropout(head_dropout),
            nn.Linear(head_hidden, 2),
        )

    def _pool(self, hidden_states: torch.Tensor, attention_mask: torch.Tensor) -> torch.Tensor:
        if self.pooling == "cls":
            return hidden_states[:, 0, :]
        cls = hidden_states[:, 0, :]
        mask = attention_mask.unsqueeze(-1).to(hidden_states.dtype)
        summed = (hidden_states * mask).sum(dim=1)
        counts = mask.sum(dim=1).clamp(min=1e-6)
        mean = summed / counts
        neg_inf = torch.finfo(hidden_states.dtype).min
        masked = hidden_states.masked_fill(mask == 0, neg_inf)
        maxed = masked.max(dim=1).values
        maxed = torch.where(torch.isfinite(maxed), maxed, torch.zeros_like(maxed))
        return torch.cat([cls, mean, maxed], dim=-1)

    def train(self, mode: bool = True) -> "UniXCoderClassifier":
        super().train(mode)
        if self.frozen_encoder:
            # Keep dropout / LayerNorm stats in eval mode so frozen features are stable.
            self.encoder.eval()
        return self

    def forward(self, input_ids: torch.Tensor, attention_mask: torch.Tensor) -> torch.Tensor:
        if self.frozen_encoder:
            with torch.no_grad():
                out = self.encoder(input_ids=input_ids, attention_mask=attention_mask)
        else:
            out = self.encoder(input_ids=input_ids, attention_mask=attention_mask)
        pooled = self._pool(out.last_hidden_state, attention_mask)
        return self.classifier(pooled)


def load_encoder(model_name: str, *, device: torch.device) -> AutoModel:
    enc = AutoModel.from_pretrained(model_name)
    enc.to(device)
    return enc
