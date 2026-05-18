"""Load tokenizer + encoder + classifier head(s) from a ``runs/<id>/`` directory.

Supports two flavours of run directories:
  * Single model: ``classifier_head.pt`` + ``tokenizer/`` + optional ``encoder/``.
  * Ensemble: ``folds/fold{i}_seed{s}/classifier_head.pt`` + shared ``tokenizer/`` +
    (frozen encoder reloaded from ``model_name``).
"""

from __future__ import annotations

import json
from pathlib import Path

import torch
from transformers import AutoModel, AutoTokenizer

from model import MODEL_NAME_DEFAULT, UniXCoderClassifier


def resolve_device() -> torch.device:
    if torch.backends.mps.is_available():
        return torch.device("mps")
    if torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


def _run_dir_ready(rd: Path) -> bool:
    return rd.is_dir() and (rd / "config.json").is_file()


def resolve_run_directory(run_dir: Path | str) -> Path:
    """Resolve ``--run-dir`` to a folder that contains ``config.json``.

    If the path itself is incomplete (common when copy-pasting a truncated run folder
    name), look for sibling directories whose names **start with** the requested
    basename; require a unique match.
    """
    rd = Path(run_dir).expanduser().resolve()
    parent = rd.parent
    prefix = rd.name

    if _run_dir_ready(rd):
        return rd

    if not parent.is_dir():
        raise FileNotFoundError(f"Runs parent is not a directory: {parent}")

    candidates = sorted(
        p
        for p in parent.iterdir()
        if p.is_dir() and p.name.startswith(prefix) and _run_dir_ready(p)
    )
    if len(candidates) == 1:
        resolved = candidates[0]
        if resolved.resolve() != rd.resolve():
            print(f"Resolved --run-dir {prefix!r} -> {resolved.name}", flush=True)
        return resolved
    if len(candidates) > 1:
        names = ", ".join(p.name for p in candidates[:5])
        extra = "" if len(candidates) <= 5 else f", … ({len(candidates)} total)"
        raise FileNotFoundError(
            f"Ambiguous --run-dir prefix {prefix!r}: multiple runs under {parent}: "
            f"{names}{extra}. Use the full folder name."
        )
    raise FileNotFoundError(
        f"No run directory with config.json matching prefix {prefix!r} under {parent}.\n"
        "Tip: run folders include the full `--run-label` suffix (tab-complete or `ls runs/`)."
    )


def _torch_load_state(path: Path, device: torch.device) -> dict:
    try:
        return torch.load(path, map_location=device, weights_only=True)
    except TypeError:
        return torch.load(path, map_location=device)


def is_ensemble_run(run_dir: Path | str) -> bool:
    rd = Path(run_dir)
    cfg_path = rd / "config.json"
    if cfg_path.is_file():
        try:
            cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
            if cfg.get("ensemble"):
                return True
        except Exception:  # noqa: BLE001
            pass
    return (rd / "folds").is_dir()


def load_model_bundle(run_dir: Path | str, *, device: torch.device | None = None) -> tuple[UniXCoderClassifier, AutoTokenizer, dict]:
    """Restore a single-model run for inference / evaluation."""
    rd = Path(run_dir)
    device = device or resolve_device()
    cfg_path = rd / "config.json"
    if not cfg_path.is_file():
        raise FileNotFoundError(f"Missing config.json in {rd}")

    config = json.loads(cfg_path.read_text(encoding="utf-8"))
    model_name = config.get("model_name", MODEL_NAME_DEFAULT)
    frozen_encoder = bool(config.get("frozen_encoder", True))
    pooling = config.get("pooling", "cls")

    tok_dir = rd / "tokenizer"
    if not tok_dir.is_dir():
        raise FileNotFoundError(f"Missing tokenizer directory: {tok_dir}")
    tokenizer = AutoTokenizer.from_pretrained(tok_dir)

    enc_dir = rd / "encoder"
    if enc_dir.is_dir() and any(enc_dir.iterdir()):
        encoder = AutoModel.from_pretrained(enc_dir)
    else:
        encoder = AutoModel.from_pretrained(model_name)

    encoder.to(device)
    model = UniXCoderClassifier(encoder, frozen_encoder=frozen_encoder, pooling=pooling).to(device)

    head_path = rd / "classifier_head.pt"
    if not head_path.is_file():
        raise FileNotFoundError(f"Missing classifier_head.pt in {rd}")
    state = _torch_load_state(head_path, device)
    model.classifier.load_state_dict(state)
    model.eval()
    return model, tokenizer, config


class EnsembleBundle:
    """Frozen encoder + N classifier heads averaged at inference time."""

    def __init__(
        self,
        *,
        encoder: AutoModel,
        heads: list[torch.nn.Module],
        tokenizer: AutoTokenizer,
        pooling: str,
        device: torch.device,
        config: dict,
    ) -> None:
        self.encoder = encoder
        self.heads = heads
        self.tokenizer = tokenizer
        self.pooling = pooling
        self.device = device
        self.config = config

    @torch.no_grad()
    def predict_probs(self, input_ids: torch.Tensor, attention_mask: torch.Tensor) -> torch.Tensor:
        """Return averaged equiv probabilities of shape (B, 2)."""
        self.encoder.eval()
        encoded = self.encoder(input_ids=input_ids, attention_mask=attention_mask)
        if self.pooling == "cls":
            pooled = encoded.last_hidden_state[:, 0, :]
        else:
            hs = encoded.last_hidden_state
            mask = attention_mask.unsqueeze(-1).to(hs.dtype)
            cls = hs[:, 0, :]
            summed = (hs * mask).sum(dim=1)
            counts = mask.sum(dim=1).clamp(min=1e-6)
            mean = summed / counts
            neg_inf = torch.finfo(hs.dtype).min
            masked = hs.masked_fill(mask == 0, neg_inf)
            maxed = masked.max(dim=1).values
            maxed = torch.where(torch.isfinite(maxed), maxed, torch.zeros_like(maxed))
            pooled = torch.cat([cls, mean, maxed], dim=-1)

        probs_accum = None
        for head in self.heads:
            head.eval()
            logits = head(pooled)
            probs = torch.softmax(logits, dim=-1)
            probs_accum = probs if probs_accum is None else probs_accum + probs
        assert probs_accum is not None
        return probs_accum / float(len(self.heads))


def load_ensemble_bundle(run_dir: Path | str, *, device: torch.device | None = None) -> EnsembleBundle:
    rd = Path(run_dir)
    device = device or resolve_device()
    cfg_path = rd / "config.json"
    if not cfg_path.is_file():
        raise FileNotFoundError(f"Missing config.json in {rd}")
    config = json.loads(cfg_path.read_text(encoding="utf-8"))
    if not config.get("ensemble"):
        raise ValueError(f"{rd} is not an ensemble run directory.")

    model_name = config.get("model_name", MODEL_NAME_DEFAULT)
    pooling = config.get("pooling", "cls")
    tokenizer = AutoTokenizer.from_pretrained(rd / "tokenizer")
    encoder = AutoModel.from_pretrained(model_name).to(device)
    encoder.eval()
    for p in encoder.parameters():
        p.requires_grad = False

    head_paths = sorted((rd / "folds").glob("fold*_seed*/classifier_head.pt"))
    if not head_paths:
        raise FileNotFoundError(f"No classifier heads under {rd / 'folds'}")

    heads: list[torch.nn.Module] = []
    for hp in head_paths:
        head = UniXCoderClassifier(encoder, frozen_encoder=True, pooling=pooling).to(device).classifier
        state = _torch_load_state(hp, device)
        head.load_state_dict(state)
        head.eval()
        heads.append(head)
    return EnsembleBundle(
        encoder=encoder,
        heads=heads,
        tokenizer=tokenizer,
        pooling=pooling,
        device=device,
        config=config,
    )
