#!/usr/bin/env python3
"""Fine-tune UniXCoder MLP head (optionally full encoder) on LLMorpheus mutant pairs."""

from __future__ import annotations

import argparse
import json
import os
import random
from datetime import datetime, timezone
from pathlib import Path

# Prefer CPU fallback for unsupported MPS ops before importing torch.
os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

import numpy as np
import pandas as pd
import torch
from torch.utils.data import DataLoader
from tqdm import tqdm
from transformers import AutoModel, AutoTokenizer, get_linear_schedule_with_warmup

from context import INPUT_FORMATS, eval_label_from_row
from dataset import MutantDataset
from inference import resolve_device
from losses import LOSS_CHOICES, make_criterion, make_train_loader
from metrics import (
    best_threshold_precision_with_min_recall_equiv,
    compute_metrics_dict,
    find_best_thresholds,
    logits_argmax_to_eval,
)
from model import MODEL_NAME_DEFAULT, POOLINGS, UniXCoderClassifier

PACKAGE_ROOT = Path(__file__).resolve().parent
DATA_DIR = PACKAGE_ROOT / "data"
RUNS_DIR = PACKAGE_ROOT / "runs"


def _torch_load(path: Path, device: torch.device) -> dict:
    try:
        return torch.load(path, map_location=device, weights_only=True)
    except TypeError:
        return torch.load(path, map_location=device)


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def parse_window(raw: str) -> int | str:
    s = raw.strip().lower()
    if s == "full":
        return "full"
    return int(raw)


def window_slug(window: int | str) -> str:
    return "full" if window == "full" else f"w{window}"


def _input_format_slug(input_format: str) -> str:
    return {"pair": "ipair", "split_diff": "isplitdiff", "diff": "idiff"}[input_format]


def _pooling_slug(pooling: str) -> str:
    return {"cls": "pcls", "cls_mean_max": "pclsmm"}[pooling]


def _loss_slug(loss_name: str, focal_gamma: float, balanced: bool) -> str:
    base = {"ce": "ce", "ce_weighted": "cew", "focal": f"focal{focal_gamma:g}"}[loss_name]
    return f"{base}-bs" if balanced else base


def _checkpoint_slug(metric: str) -> str | None:
    return {
        "macro_f1": None,
        "f1_equiv": "ck-f1eq",
        "mcc": "ck-mcc",
        "kappa": "ck-kappa",
        "tuned_macro_f1": "ck-tmf1",
        "tuned_f1_equiv": "ck-tfeq",
    }.get(metric)


def _label_smoothing_slug(ls: float) -> str | None:
    return None if ls <= 1e-12 else f"ls{max(1, round(ls * 100))}"


def _equiv_weight_slug(mult: float) -> str | None:
    return None if abs(float(mult) - 1.0) < 1e-9 else f"eqw{round(float(mult) * 100):d}"


def build_run_dir_name(
    *,
    ts: str,
    window: int | str,
    epochs: int,
    frozen_encoder: bool,
    max_length: int,
    batch_size: int,
    lr: float,
    seed: int,
    input_format: str,
    pooling: str,
    loss_name: str,
    focal_gamma: float,
    balanced_sampler: bool,
    checkpoint_metric: str,
    label_smoothing: float,
    equiv_weight_mult: float,
    run_label: str | None,
) -> str:
    """Human-readable folder name (sorted by timestamp prefix)."""
    mode_slug = "frozen" if frozen_encoder else "full-ft"
    lr_compact = f"{lr:.0e}".replace("e-0", "e-").replace("e+0", "e")
    parts = [
        ts,
        f"window-{window_slug(window)}",
        f"ep{epochs}",
        mode_slug,
        _input_format_slug(input_format),
        _pooling_slug(pooling),
        _loss_slug(loss_name, focal_gamma, balanced_sampler),
        *[
            p
            for p in (
                _checkpoint_slug(checkpoint_metric),
                _label_smoothing_slug(label_smoothing),
                _equiv_weight_slug(equiv_weight_mult),
            )
            if p
        ],
        f"ml{max_length}",
        f"bs{batch_size}",
        f"lr{lr_compact}",
    ]
    if seed != 42:
        parts.append(f"seed{seed}")
    name = "-".join(parts)
    if run_label:
        safe = "".join(c if (c.isalnum() or c in "-_") else "-" for c in run_label.strip())
        while "--" in safe:
            safe = safe.replace("--", "-")
        safe = safe.strip("-")
        if safe:
            name = f"{name}-{safe}"
    return name


def class_weights(train_df: pd.DataFrame, device: torch.device, *, equiv_weight_mult: float = 1.0) -> torch.Tensor:
    """Inverse-frequency weights for CrossEntropyLoss (classes 0 and 1).

    ``equiv_weight_mult`` scales loss on label 1 (equivalent); try e.g. 1.25–2.0 when chasing recall_equiv.
    """
    counts = train_df["label"].value_counts().reindex([0, 1], fill_value=0).astype(float)
    n = len(train_df)
    num_classes = 2.0
    w = torch.tensor([n / (num_classes * max(counts.iloc[i], 1.0)) for i in range(2)], dtype=torch.float32, device=device)
    if equiv_weight_mult != 1.0:
        w = w.clone()
        w[1] = w[1] * float(equiv_weight_mult)
    return w


@torch.no_grad()
def evaluate_split(
    model: UniXCoderClassifier,
    loader: DataLoader,
    device: torch.device,
) -> tuple[list[int], list[float]]:
    model.eval()
    preds: list[int] = []
    equiv_probs: list[float] = []
    for batch in loader:
        ids = batch["input_ids"].to(device)
        mask = batch["attention_mask"].to(device)
        logits = model(ids, mask)
        probs = torch.softmax(logits, dim=-1)
        pred = torch.argmax(logits, dim=-1)
        preds.extend(pred.cpu().numpy().tolist())
        equiv_probs.extend(probs[:, 1].cpu().numpy().tolist())
    return preds, equiv_probs


BEST_CHECKPOINT_METRICS = ("macro_f1", "f1_equiv", "mcc", "kappa", "tuned_macro_f1", "tuned_f1_equiv")


def val_checkpoint_scalar(
    best_on: str,
    *,
    metrics: dict,
    gold_eval: list,
    equiv_probs: list[float],
) -> float:
    """Scalar used to decide which epoch's weights we keep."""
    if best_on == "tuned_macro_f1":
        kg: list[str] = []
        kp: list[float] = []
        for i, g in enumerate(gold_eval):
            if g is not None:
                kg.append(str(g))
                kp.append(float(equiv_probs[i]))
        tbl = find_best_thresholds(kg, kp)
        ent = tbl.get("macro_f1") or {}
        return float(ent.get("score", 0.0))
    if best_on == "tuned_f1_equiv":
        kg = []
        kp = []
        for i, g in enumerate(gold_eval):
            if g is not None:
                kg.append(str(g))
                kp.append(float(equiv_probs[i]))
        tbl = find_best_thresholds(kg, kp)
        ent = tbl.get("equiv_f1") or {}
        return float(ent.get("score", 0.0))
    return float(metrics.get(best_on, 0.0) or 0.0)


def main() -> None:
    parser = argparse.ArgumentParser(description="Train UniXCoder mutant classifier")
    parser.add_argument("--window", type=str, default="0", help='Context window int or "full" (0 = fragments only)')
    parser.add_argument("--epochs", type=int, default=5)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--lr", type=float, default=None, help="Overrides automatic LR (frozen default 2e-4, full-FT 2e-5)")
    parser.add_argument("--max-length", type=int, default=512)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--full-finetune", action="store_true", help="Unfreeze UniXCoder encoder (riskier on ~763 rows)")
    parser.add_argument("--model-name", type=str, default=MODEL_NAME_DEFAULT)
    parser.add_argument("--train-csv", type=Path, default=DATA_DIR / "training.csv")
    parser.add_argument("--val-csv", type=Path, default=DATA_DIR / "validation.csv")
    parser.add_argument(
        "--input-format",
        type=str,
        default="split_diff",
        choices=list(INPUT_FORMATS),
        help="How original/mutant are fed to UniXCoder. split_diff is the new default.",
    )
    parser.add_argument(
        "--pooling",
        type=str,
        default="cls_mean_max",
        choices=list(POOLINGS),
        help="Token aggregation for the classifier head. cls_mean_max is the new default.",
    )
    parser.add_argument(
        "--loss",
        type=str,
        default="focal",
        choices=list(LOSS_CHOICES),
        help="Loss function. focal helps the minority (equivalent) class.",
    )
    parser.add_argument("--focal-gamma", type=float, default=2.0)
    parser.add_argument(
        "--balanced-sampler",
        action="store_true",
        help="Sample each minibatch to be roughly class-balanced (with replacement).",
    )
    parser.add_argument(
        "--best-on",
        type=str,
        default="macro_f1",
        choices=list(BEST_CHECKPOINT_METRICS),
        help="Checkpoint metric. tuned_* options sweep θ on validation each epoch (tuned_f1_equiv → equiv-F1).",
    )
    parser.add_argument(
        "--label-smoothing",
        type=float,
        default=0.0,
        help="Cross-entropy label smoothing (e.g. 0.05). May reduce brittle overconfidence.",
    )
    parser.add_argument(
        "--thresh-min-recall-equiv",
        type=float,
        default=None,
        help="If set, thresholds.json adds precision_if_recall_ge (best θ at ≥ this equiv recall).",
    )
    parser.add_argument(
        "--equiv-weight-mult",
        type=float,
        default=1.0,
        help="Multiply loss weight for class 1 (equivalent). 1.0 = default inverse-frequency only; try 1.5–2.0 for higher recall_equiv.",
    )
    parser.add_argument(
        "--run-label",
        type=str,
        default=None,
        help="Optional suffix on the run folder name (letters, digits, _ and - only after sanitizing)",
    )
    args = parser.parse_args()

    if not (0.0 <= args.label_smoothing <= 0.35):
        raise SystemExit("--label-smoothing must be in [0, 0.35]")
    if not (0.25 <= args.equiv_weight_mult <= 8.0):
        raise SystemExit("--equiv-weight-mult must be in [0.25, 8]")

    window = parse_window(args.window)
    frozen_encoder = not args.full_finetune
    if args.lr is not None:
        lr = args.lr
    else:
        lr = 2e-4 if frozen_encoder else 2e-5

    device = resolve_device()
    set_seed(args.seed)

    if args.full_finetune:
        print(
            "⚠️  Full fine-tuning on ~763 training pairs may overfit; prefer frozen encoder unless comparing deliberately.",
            flush=True,
        )

    train_path = args.train_csv
    val_path = args.val_csv
    if not train_path.is_file() or not val_path.is_file():
        raise FileNotFoundError(f"Missing CSV splits. Run prepare_data.py first.\n  {train_path}\n  {val_path}")

    train_df = pd.read_csv(train_path)
    val_df = pd.read_csv(val_path)

    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%SZ")
    run_dir = RUNS_DIR / build_run_dir_name(
        ts=ts,
        window=window,
        epochs=args.epochs,
        frozen_encoder=frozen_encoder,
        max_length=args.max_length,
        batch_size=args.batch_size,
        lr=lr,
        seed=args.seed,
        input_format=args.input_format,
        pooling=args.pooling,
        loss_name=args.loss,
        focal_gamma=args.focal_gamma,
        balanced_sampler=args.balanced_sampler,
        checkpoint_metric=args.best_on,
        label_smoothing=args.label_smoothing,
        equiv_weight_mult=args.equiv_weight_mult,
        run_label=args.run_label,
    )
    run_dir.mkdir(parents=True, exist_ok=True)

    print(f"Device: {device}", flush=True)
    print(f"Run directory: {run_dir}", flush=True)

    tokenizer = AutoTokenizer.from_pretrained(args.model_name)
    encoder = AutoModel.from_pretrained(args.model_name).to(device)
    model = UniXCoderClassifier(
        encoder,
        frozen_encoder=frozen_encoder,
        pooling=args.pooling,
    ).to(device)

    train_ds = MutantDataset(
        train_path,
        tokenizer,
        max_length=args.max_length,
        window_or_full=window,
        input_format=args.input_format,
    )
    val_ds = MutantDataset(
        val_path,
        tokenizer,
        max_length=args.max_length,
        window_or_full=window,
        input_format=args.input_format,
    )

    if train_ds.truncated_count > 0:
        print(
            f"Note: {train_ds.truncated_count}/{len(train_ds)} training pairs exceed max_length={args.max_length} "
            "before tokenizer truncation.",
            flush=True,
        )
    if val_ds.truncated_count > 0:
        print(
            f"Note: {val_ds.truncated_count}/{len(val_ds)} validation pairs exceed max_length={args.max_length}.",
            flush=True,
        )

    train_loader = make_train_loader(
        train_ds,
        train_df["label"],
        batch_size=args.batch_size,
        balanced_sampler=args.balanced_sampler,
    )
    val_loader = DataLoader(val_ds, batch_size=args.batch_size, shuffle=False, num_workers=0)

    val_gold_eval = [eval_label_from_row(val_df.iloc[i].to_dict()) for i in range(len(val_df))]

    weights = class_weights(train_df, device, equiv_weight_mult=args.equiv_weight_mult)
    criterion = make_criterion(
        args.loss,
        class_weight=weights,
        focal_gamma=args.focal_gamma,
        label_smoothing=args.label_smoothing,
    )

    params = model.classifier.parameters() if frozen_encoder else model.parameters()
    optimizer = torch.optim.AdamW(params, lr=lr, weight_decay=0.01)
    total_steps = max(1, len(train_loader) * args.epochs)
    warmup = max(1, total_steps // 10)
    scheduler = get_linear_schedule_with_warmup(
        optimizer,
        num_warmup_steps=warmup,
        num_training_steps=total_steps,
    )

    log_path = run_dir / "training_log.jsonl"
    best_ckpt_score = float("-inf")
    best_epoch = -1

    for epoch in range(args.epochs):
        model.train()
        running = 0.0
        pbar = tqdm(train_loader, desc=f"Epoch {epoch + 1}/{args.epochs}")
        for batch in pbar:
            ids = batch["input_ids"].to(device)
            mask = batch["attention_mask"].to(device)
            labels = batch["label"].to(device)

            optimizer.zero_grad()
            logits = model(ids, mask)
            loss = criterion(logits, labels)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            scheduler.step()

            running += loss.item()
            pbar.set_postfix(loss=f"{loss.item():.4f}")

        train_loss = running / max(len(train_loader), 1)

        val_preds, val_equiv_p = evaluate_split(model, val_loader, device)
        pred_eval = [logits_argmax_to_eval(p) for p in val_preds]
        metrics = compute_metrics_dict(
            [g for g in val_gold_eval if g is not None],
            [pred_eval[i] for i, g in enumerate(val_gold_eval) if g is not None],
        )
        chk = val_checkpoint_scalar(
            args.best_on,
            metrics=metrics,
            gold_eval=val_gold_eval,
            equiv_probs=list(val_equiv_p),
        )

        row_log = {
            "epoch": epoch + 1,
            "train_loss": train_loss,
            **{k: v for k, v in metrics.items() if k != "confusion"},
            "val_checkpoint_metric": args.best_on,
            "val_checkpoint_scalar": chk,
        }
        with log_path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(row_log, default=float) + "\n")

        macro_f1 = float(metrics["macro_f1"])
        print(
            f"Epoch {epoch + 1}: train_loss={train_loss:.4f} val_macro_f1={macro_f1:.4f} "
            f"{args.best_on}={chk:.4f} kappa={metrics['kappa']} mcc={metrics['mcc']}",
            flush=True,
        )

        if chk > best_ckpt_score:
            best_ckpt_score = chk
            best_epoch = epoch + 1
            torch.save(model.classifier.state_dict(), run_dir / "classifier_head.pt")
            tokenizer.save_pretrained(run_dir / "tokenizer")
            if not frozen_encoder:
                model.encoder.save_pretrained(run_dir / "encoder")

    # Reload best weights for final predictions / metrics.json
    head_pt = run_dir / "classifier_head.pt"
    if not head_pt.is_file():
        torch.save(model.classifier.state_dict(), head_pt)
        tokenizer.save_pretrained(run_dir / "tokenizer")
        if not frozen_encoder:
            model.encoder.save_pretrained(run_dir / "encoder")

    reload_model: UniXCoderClassifier
    if frozen_encoder:
        encoder_reload = AutoModel.from_pretrained(args.model_name).to(device)
        reload_model = UniXCoderClassifier(
            encoder_reload, frozen_encoder=True, pooling=args.pooling
        ).to(device)
        reload_model.classifier.load_state_dict(_torch_load(head_pt, device))
    else:
        enc_ft = AutoModel.from_pretrained(run_dir / "encoder").to(device)
        reload_model = UniXCoderClassifier(
            enc_ft, frozen_encoder=False, pooling=args.pooling
        ).to(device)
        reload_model.classifier.load_state_dict(_torch_load(head_pt, device))
    reload_model.to(device)

    final_preds, final_equiv_p = evaluate_split(reload_model, val_loader, device)
    pred_eval = [logits_argmax_to_eval(p) for p in final_preds]

    pairs_gold_pred = [(g, pred_eval[i]) for i, g in enumerate(val_gold_eval) if g is not None]
    metrics_final = compute_metrics_dict([p[0] for p in pairs_gold_pred], [p[1] for p in pairs_gold_pred])

    config = {
        "model_name": args.model_name,
        "window": window if isinstance(window, int) else str(window),
        "frozen_encoder": frozen_encoder,
        "max_length": args.max_length,
        "epochs": args.epochs,
        "batch_size": args.batch_size,
        "lr": lr,
        "seed": args.seed,
        "input_format": args.input_format,
        "pooling": args.pooling,
        "loss": args.loss,
        "focal_gamma": args.focal_gamma,
        "balanced_sampler": args.balanced_sampler,
        "label_smoothing": args.label_smoothing,
        "checkpoint_metric": args.best_on,
        "best_checkpoint_score": float(best_ckpt_score),
        "best_epoch": best_epoch,
        "thresh_min_recall_equiv": args.thresh_min_recall_equiv,
        "equiv_weight_mult": args.equiv_weight_mult,
        "best_val_macro_f1": float(best_ckpt_score) if args.best_on == "macro_f1" else None,
        "train_rows": len(train_df),
        "val_rows": len(val_df),
        "train_truncated_pairs": train_ds.truncated_count,
        "val_truncated_pairs": val_ds.truncated_count,
    }
    (run_dir / "config.json").write_text(json.dumps(config, indent=2), encoding="utf-8")

    metrics_out = {
        **{k: v for k, v in metrics_final.items() if k != "confusion"},
        "confusion_matrix": metrics_final["confusion"],
    }
    (run_dir / "metrics.json").write_text(json.dumps(metrics_out, indent=2, default=float), encoding="utf-8")

    val_gold_eval_kept = [g for g in val_gold_eval if g is not None]
    val_probs_kept = [final_equiv_p[i] for i, g in enumerate(val_gold_eval) if g is not None]
    thresholds = find_best_thresholds(val_gold_eval_kept, val_probs_kept)
    if args.thresh_min_recall_equiv is not None:
        constrained = best_threshold_precision_with_min_recall_equiv(
            val_gold_eval_kept,
            val_probs_kept,
            min_recall_equiv=float(args.thresh_min_recall_equiv),
        )
        thresholds["precision_if_recall_ge"] = (
            constrained
            if constrained
            else {
                "min_recall_equiv": float(args.thresh_min_recall_equiv),
                "note": "no threshold achieved this recall on the validation sweep",
            }
        )
    (run_dir / "thresholds.json").write_text(json.dumps(thresholds, indent=2, default=float), encoding="utf-8")
    tuned = thresholds.get("macro_f1") if thresholds else None
    if tuned:
        print(
            f"Tuned threshold (macro_f1): {tuned['threshold']:.2f} -> macro_f1={tuned['score']:.4f} "
            "(argmax used 0.50)",
            flush=True,
        )

    pred_rows = []
    for i in range(len(val_df)):
        row = val_df.iloc[i].to_dict()
        gold = eval_label_from_row(row)
        pred = logits_argmax_to_eval(final_preds[i])
        pred_rows.append(
            {
                **{k: row.get(k, "") for k in ("project", "file", "id", "line", "column", "original", "replacement", "coding")},
                "gold_eval": gold or "",
                "pred_eval": pred,
                "equiv_prob": round(float(final_equiv_p[i]), 6),
                "correct": gold == pred if gold else "",
            }
        )
    pd.DataFrame(pred_rows).to_csv(run_dir / "predictions.csv", index=False)

    print(f"\nDone. Best epoch (by {args.best_on}): {best_epoch} score={best_ckpt_score:.4f}", flush=True)
    print(f"Artifacts: {run_dir}", flush=True)


if __name__ == "__main__":
    main()
