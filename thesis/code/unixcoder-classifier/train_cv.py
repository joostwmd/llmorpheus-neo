#!/usr/bin/env python3
"""Stratified K-fold x N-seed ensemble training on the full labeled set.

Each (fold, seed) pair trains a fresh classifier head with the same encoder.
Each model predicts on its held-out fold to build out-of-fold (OOF) probabilities
for every row in ``data/all.csv``. OOF probabilities are then used to:
  * compute honest OOF metrics (no tuning leakage)
  * pick decision thresholds that maximise macro-F1 / equiv-F1 / kappa / mcc
  * stash all classifier heads + the tuned thresholds in a single ensemble run dir

Outputs (under ``runs/ensemble-...``):
  config.json
  tokenizer/                           saved tokenizer
  folds/fold{f}_seed{s}/classifier_head.pt
  oof_predictions.csv                  per-row averaged equiv_prob + chosen pred
  metrics.json                         OOF metrics at the chosen threshold
  thresholds.json                      best threshold per objective
  per_fold_metrics.json                metrics for each individual fold model
  training_log.jsonl                   one line per (fold, seed) end-of-training summary
"""

from __future__ import annotations

import argparse
import json
import os
import random
from datetime import datetime, timezone
from pathlib import Path

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
    thresholded_pred_labels,
)
from model import MODEL_NAME_DEFAULT, POOLINGS, UniXCoderClassifier
from train import (
    BEST_CHECKPOINT_METRICS,
    _checkpoint_slug,
    _equiv_weight_slug,
    _input_format_slug,
    _label_smoothing_slug,
    _loss_slug,
    _pooling_slug,
    class_weights,
    evaluate_split,
    parse_window,
    val_checkpoint_scalar,
    window_slug,
)

PACKAGE_ROOT = Path(__file__).resolve().parent
DATA_DIR = PACKAGE_ROOT / "data"
RUNS_DIR = PACKAGE_ROOT / "runs"


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def stratified_kfold_indices(labels: np.ndarray, *, n_splits: int, seed: int) -> list[np.ndarray]:
    """Return ``n_splits`` validation index arrays, each row appearing in exactly one."""
    rng = np.random.default_rng(seed)
    folds: list[list[int]] = [[] for _ in range(n_splits)]
    for cls in np.unique(labels):
        cls_idx = np.where(labels == cls)[0]
        cls_idx = np.array(cls_idx, copy=True)
        rng.shuffle(cls_idx)
        for i, ix in enumerate(cls_idx):
            folds[i % n_splits].append(int(ix))
    return [np.array(sorted(f), dtype=np.int64) for f in folds]


def build_ensemble_run_name(
    *,
    ts: str,
    window: int | str,
    epochs: int,
    folds: int,
    seeds: int,
    input_format: str,
    pooling: str,
    loss_name: str,
    focal_gamma: float,
    balanced_sampler: bool,
    checkpoint_metric: str,
    label_smoothing: float,
    equiv_weight_mult: float,
    max_length: int,
    batch_size: int,
    lr: float,
    run_label: str | None,
) -> str:
    lr_compact = f"{lr:.0e}".replace("e-0", "e-").replace("e+0", "e")
    parts = [
        "ensemble",
        ts,
        f"window-{window_slug(window)}",
        f"ep{epochs}",
        f"k{folds}",
        f"s{seeds}",
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
    name = "-".join(parts)
    if run_label:
        safe = "".join(c if (c.isalnum() or c in "-_") else "-" for c in run_label.strip())
        while "--" in safe:
            safe = safe.replace("--", "-")
        safe = safe.strip("-")
        if safe:
            name = f"{name}-{safe}"
    return name


def main() -> None:
    parser = argparse.ArgumentParser(description="K-fold x N-seed UniXCoder ensemble training")
    parser.add_argument("--window", type=str, default="0")
    parser.add_argument("--epochs", type=int, default=15)
    parser.add_argument("--folds", type=int, default=5)
    parser.add_argument("--seeds", type=int, default=3)
    parser.add_argument("--seed-base", type=int, default=42, help="Base seed; per-run seeds = [base, base+1, ...]")
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--lr", type=float, default=2e-4)
    parser.add_argument("--max-length", type=int, default=512)
    parser.add_argument(
        "--input-format",
        type=str,
        default="split_diff",
        choices=list(INPUT_FORMATS),
    )
    parser.add_argument(
        "--pooling",
        type=str,
        default="cls_mean_max",
        choices=list(POOLINGS),
    )
    parser.add_argument(
        "--loss",
        type=str,
        default="focal",
        choices=list(LOSS_CHOICES),
    )
    parser.add_argument("--focal-gamma", type=float, default=2.0)
    parser.add_argument("--balanced-sampler", action="store_true")
    parser.add_argument(
        "--best-on",
        type=str,
        default="macro_f1",
        choices=list(BEST_CHECKPOINT_METRICS),
        help="Metric per fold/seed for choosing saved epoch (f1_equiv favors minority class).",
    )
    parser.add_argument("--label-smoothing", type=float, default=0.0)
    parser.add_argument(
        "--equiv-weight-mult",
        type=float,
        default=1.0,
        help="Extra multiplier on CE/Focal weight for label 1 (equivalent); try 1.5–2.0.",
    )
    parser.add_argument(
        "--thresh-min-recall-equiv",
        type=float,
        default=None,
        help="Adds precision_if_recall_ge to thresholds.json on full OOF probs.",
    )
    parser.add_argument("--all-csv", type=Path, default=DATA_DIR / "all.csv")
    parser.add_argument("--model-name", type=str, default=MODEL_NAME_DEFAULT)
    parser.add_argument("--run-label", type=str, default=None)
    args = parser.parse_args()

    if not (0.0 <= args.label_smoothing <= 0.35):
        raise SystemExit("--label-smoothing must be in [0, 0.35]")
    if not (0.25 <= args.equiv_weight_mult <= 8.0):
        raise SystemExit("--equiv-weight-mult must be in [0.25, 8]")

    window = parse_window(args.window)
    device = resolve_device()
    print(f"Device: {device}", flush=True)

    if args.folds < 2:
        raise SystemExit("--folds must be >= 2")
    if args.seeds < 1:
        raise SystemExit("--seeds must be >= 1")

    if not args.all_csv.is_file():
        raise FileNotFoundError(f"Missing {args.all_csv}; run prepare_data.py first.")

    full_df = pd.read_csv(args.all_csv)
    if "label" not in full_df.columns:
        lm = {"Equivalent": 1, "Behavioral Change": 0}
        full_df["label"] = full_df["coding"].map(lm)
    full_df = full_df.reset_index(drop=True)
    labels = full_df["label"].to_numpy().astype(int)
    print(
        f"Loaded {len(full_df)} rows; equivalent={int((labels == 1).sum())} "
        f"non-equivalent={int((labels == 0).sum())}",
        flush=True,
    )

    print(f"Fold checkpoint metric (--best-on): {args.best_on}", flush=True)

    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%SZ")
    run_dir = RUNS_DIR / build_ensemble_run_name(
        ts=ts,
        window=window,
        epochs=args.epochs,
        folds=args.folds,
        seeds=args.seeds,
        input_format=args.input_format,
        pooling=args.pooling,
        loss_name=args.loss,
        focal_gamma=args.focal_gamma,
        balanced_sampler=args.balanced_sampler,
        checkpoint_metric=args.best_on,
        label_smoothing=args.label_smoothing,
        equiv_weight_mult=args.equiv_weight_mult,
        max_length=args.max_length,
        batch_size=args.batch_size,
        lr=args.lr,
        run_label=args.run_label,
    )
    folds_dir = run_dir / "folds"
    folds_dir.mkdir(parents=True, exist_ok=True)
    print(f"Run directory: {run_dir}", flush=True)

    tokenizer = AutoTokenizer.from_pretrained(args.model_name)
    tokenizer.save_pretrained(run_dir / "tokenizer")

    encoder = AutoModel.from_pretrained(args.model_name).to(device)
    encoder.eval()
    for p in encoder.parameters():
        p.requires_grad = False

    val_idx_per_fold = stratified_kfold_indices(labels, n_splits=args.folds, seed=args.seed_base)

    # Per-row sum of equiv probabilities, count of models that scored it.
    oof_probs_sum = np.zeros(len(full_df), dtype=np.float64)
    oof_counts = np.zeros(len(full_df), dtype=np.int64)

    per_fold_metrics: list[dict] = []
    log_path = run_dir / "training_log.jsonl"

    seeds = [args.seed_base + s for s in range(args.seeds)]

    for fold_i, val_idx in enumerate(val_idx_per_fold):
        train_idx = np.array([i for i in range(len(full_df)) if i not in set(val_idx.tolist())], dtype=np.int64)
        fold_train_df = full_df.iloc[train_idx].reset_index(drop=True)
        fold_val_df = full_df.iloc[val_idx].reset_index(drop=True)

        train_ds = MutantDataset(
            csv_path=None,
            tokenizer=tokenizer,
            max_length=args.max_length,
            window_or_full=window,
            input_format=args.input_format,
            df=fold_train_df,
        )
        val_ds = MutantDataset(
            csv_path=None,
            tokenizer=tokenizer,
            max_length=args.max_length,
            window_or_full=window,
            input_format=args.input_format,
            df=fold_val_df,
        )

        val_loader = DataLoader(val_ds, batch_size=args.batch_size, shuffle=False, num_workers=0)

        val_gold_eval = [eval_label_from_row(fold_val_df.iloc[i].to_dict()) for i in range(len(fold_val_df))]

        cw = class_weights(fold_train_df, device, equiv_weight_mult=args.equiv_weight_mult)

        for seed in seeds:
            set_seed(seed)
            print(f"\n=== Fold {fold_i + 1}/{args.folds} seed {seed} (train={len(train_ds)} val={len(val_ds)}) ===", flush=True)

            model = UniXCoderClassifier(
                encoder,
                frozen_encoder=True,
                pooling=args.pooling,
            ).to(device)

            train_loader = make_train_loader(
                train_ds,
                fold_train_df["label"],
                batch_size=args.batch_size,
                balanced_sampler=args.balanced_sampler,
            )
            criterion = make_criterion(
                args.loss,
                class_weight=cw,
                focal_gamma=args.focal_gamma,
                label_smoothing=args.label_smoothing,
            )
            optimizer = torch.optim.AdamW(model.classifier.parameters(), lr=args.lr, weight_decay=0.01)
            total_steps = max(1, len(train_loader) * args.epochs)
            scheduler = get_linear_schedule_with_warmup(
                optimizer,
                num_warmup_steps=max(1, total_steps // 10),
                num_training_steps=total_steps,
            )

            best_ckpt_score = float("-inf")
            best_state: dict | None = None
            best_epoch = 0
            for epoch in range(args.epochs):
                model.train()
                pbar = tqdm(train_loader, desc=f"f{fold_i + 1}s{seed} ep{epoch + 1}/{args.epochs}")
                running = 0.0
                for batch in pbar:
                    ids = batch["input_ids"].to(device)
                    mask = batch["attention_mask"].to(device)
                    yb = batch["label"].to(device)
                    optimizer.zero_grad()
                    logits = model(ids, mask)
                    loss = criterion(logits, yb)
                    loss.backward()
                    torch.nn.utils.clip_grad_norm_(model.classifier.parameters(), 1.0)
                    optimizer.step()
                    scheduler.step()
                    running += loss.item()
                    pbar.set_postfix(loss=f"{loss.item():.4f}")

                preds, equiv_p = evaluate_split(model, val_loader, device)
                pred_eval = [logits_argmax_to_eval(p) for p in preds]
                cur = compute_metrics_dict(
                    [g for g in val_gold_eval if g is not None],
                    [pred_eval[i] for i, g in enumerate(val_gold_eval) if g is not None],
                )
                chk = val_checkpoint_scalar(
                    args.best_on,
                    metrics=cur,
                    gold_eval=val_gold_eval,
                    equiv_probs=list(equiv_p),
                )
                if chk > best_ckpt_score:
                    best_ckpt_score = chk
                    best_epoch = epoch + 1
                    best_state = {k: v.detach().cpu().clone() for k, v in model.classifier.state_dict().items()}

            assert best_state is not None
            model.classifier.load_state_dict(best_state)

            sub_dir = folds_dir / f"fold{fold_i}_seed{seed}"
            sub_dir.mkdir(parents=True, exist_ok=True)
            torch.save(best_state, sub_dir / "classifier_head.pt")

            preds, equiv_p = evaluate_split(model, val_loader, device)
            pred_eval = [logits_argmax_to_eval(p) for p in preds]
            final = compute_metrics_dict(
                [g for g in val_gold_eval if g is not None],
                [pred_eval[i] for i, g in enumerate(val_gold_eval) if g is not None],
            )
            per_fold_metrics.append({
                "fold": fold_i,
                "seed": seed,
                "checkpoint_metric": args.best_on,
                "best_checkpoint_fold_score": float(best_ckpt_score),
                "best_epoch": best_epoch,
                "train_rows": len(train_ds),
                "val_rows": len(val_ds),
                **{k: v for k, v in final.items() if k != "confusion"},
                "confusion_matrix": final["confusion"],
            })
            with log_path.open("a", encoding="utf-8") as f:
                f.write(json.dumps(per_fold_metrics[-1], default=float) + "\n")

            for local_i, global_i in enumerate(val_idx.tolist()):
                oof_probs_sum[global_i] += float(equiv_p[local_i])
                oof_counts[global_i] += 1

    if (oof_counts == 0).any():
        raise RuntimeError("Some rows received no OOF prediction; check fold construction.")
    oof_probs = oof_probs_sum / oof_counts

    gold_eval_all = [eval_label_from_row(full_df.iloc[i].to_dict()) for i in range(len(full_df))]
    kept_gold = [g for g in gold_eval_all if g is not None]
    kept_probs = [float(oof_probs[i]) for i, g in enumerate(gold_eval_all) if g is not None]

    thresholds = find_best_thresholds(kept_gold, kept_probs)
    if args.thresh_min_recall_equiv is not None:
        constrained = best_threshold_precision_with_min_recall_equiv(
            kept_gold,
            kept_probs,
            min_recall_equiv=float(args.thresh_min_recall_equiv),
        )
        thresholds["precision_if_recall_ge"] = (
            constrained
            if constrained
            else {
                "min_recall_equiv": float(args.thresh_min_recall_equiv),
                "note": "no threshold achieved this recall on the OOF sweep",
            }
        )
    (run_dir / "thresholds.json").write_text(json.dumps(thresholds, indent=2, default=float), encoding="utf-8")

    chosen = thresholds.get("macro_f1")
    chosen_threshold = float(chosen["threshold"]) if chosen else 0.5
    chosen_preds = thresholded_pred_labels(kept_probs, chosen_threshold)
    final_metrics = compute_metrics_dict(kept_gold, chosen_preds)

    metrics_out = {
        **{k: v for k, v in final_metrics.items() if k != "confusion"},
        "confusion_matrix": final_metrics["confusion"],
        "chosen_threshold": chosen_threshold,
        "chosen_threshold_objective": "macro_f1",
        "fold_count": args.folds,
        "seed_count": args.seeds,
        "model_count": args.folds * args.seeds,
    }
    (run_dir / "metrics.json").write_text(json.dumps(metrics_out, indent=2, default=float), encoding="utf-8")

    (run_dir / "per_fold_metrics.json").write_text(
        json.dumps(per_fold_metrics, indent=2, default=float), encoding="utf-8"
    )

    rows = []
    for i in range(len(full_df)):
        row = full_df.iloc[i].to_dict()
        gold = eval_label_from_row(row)
        pred = "EQUIVALENT" if oof_probs[i] >= chosen_threshold else "BEHAVIORAL_CHANGE"
        rows.append(
            {
                **{k: row.get(k, "") for k in ("project", "file", "id", "line", "column", "original", "replacement", "coding")},
                "gold_eval": gold or "",
                "equiv_prob": round(float(oof_probs[i]), 6),
                "pred_eval": pred,
                "correct": (gold == pred) if gold else "",
            }
        )
    pd.DataFrame(rows).to_csv(run_dir / "oof_predictions.csv", index=False)

    config = {
        "ensemble": True,
        "model_name": args.model_name,
        "window": window if isinstance(window, int) else str(window),
        "frozen_encoder": True,
        "max_length": args.max_length,
        "epochs": args.epochs,
        "folds": args.folds,
        "seeds": args.seeds,
        "seed_base": args.seed_base,
        "batch_size": args.batch_size,
        "lr": args.lr,
        "input_format": args.input_format,
        "pooling": args.pooling,
        "loss": args.loss,
        "focal_gamma": args.focal_gamma,
        "balanced_sampler": args.balanced_sampler,
        "checkpoint_metric": args.best_on,
        "label_smoothing": args.label_smoothing,
        "equiv_weight_mult": args.equiv_weight_mult,
        "thresh_min_recall_equiv": args.thresh_min_recall_equiv,
        "n_rows": len(full_df),
        "chosen_threshold": chosen_threshold,
        "chosen_threshold_objective": "macro_f1",
    }
    (run_dir / "config.json").write_text(json.dumps(config, indent=2), encoding="utf-8")

    print("\n=== Ensemble OOF results @ macro_f1-optimal threshold ===", flush=True)
    print(
        json.dumps(
            {k: v for k, v in metrics_out.items() if k not in ("confusion_matrix",)},
            indent=2,
            default=float,
        ),
        flush=True,
    )
    print(f"Artifacts: {run_dir}", flush=True)


if __name__ == "__main__":
    main()
