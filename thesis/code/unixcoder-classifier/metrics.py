"""Metric parity with thesis/code/python-classifier (GEPA / evaluation.py)."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

_PC = Path(__file__).resolve().parent.parent / "python-classifier"
if _PC.is_dir():
    sys.path.insert(0, str(_PC))

from evaluation import (  # noqa: E402
    ConfusionMatrix,
    accuracy,
    build_confusion_matrix,
    cohens_kappa,
    confusion_total,
    f1_score,
    mcc,
    precision_behavioral,
    precision_equiv,
    recall_behavioral,
    recall_equiv,
)


def logits_argmax_to_eval(pred_class: int) -> str:
    return "EQUIVALENT" if int(pred_class) == 1 else "BEHAVIORAL_CHANGE"


def compute_metrics_dict(gold_eval: list[str], pred_eval: list[str]) -> dict[str, Any]:
    pairs = list(zip(gold_eval, pred_eval))
    cm = build_confusion_matrix(pairs)
    n = confusion_total(cm)

    pe = precision_equiv(cm)
    re = recall_equiv(cm)
    pb = precision_behavioral(cm)
    rb = recall_behavioral(cm)
    f1_e = f1_score(pe, re)
    f1_b = f1_score(pb, rb)
    macro_f1 = (((f1_e or 0.0) + (f1_b or 0.0)) / 2.0) if n else 0.0

    return {
        "macro_f1": macro_f1,
        "kappa": cohens_kappa(cm),
        "mcc": mcc(cm),
        "accuracy": accuracy(cm),
        "precision_equiv": pe,
        "recall_equiv": re,
        "f1_equiv": f1_e,
        "precision_behavioral": pb,
        "recall_behavioral": rb,
        "f1_behavioral": f1_b,
        "TP": cm.TP,
        "FN": cm.FN,
        "FP": cm.FP,
        "TN": cm.TN,
        "n": n,
        "confusion": {"TP": cm.TP, "FN": cm.FN, "FP": cm.FP, "TN": cm.TN},
    }


def confusion_matrix_obj(metrics: dict[str, Any]) -> ConfusionMatrix:
    return ConfusionMatrix(
        TP=int(metrics["TP"]),
        FN=int(metrics["FN"]),
        FP=int(metrics["FP"]),
        TN=int(metrics["TN"]),
    )


def thresholded_pred_labels(equiv_probs: list[float], threshold: float) -> list[str]:
    return ["EQUIVALENT" if p >= threshold else "BEHAVIORAL_CHANGE" for p in equiv_probs]


def find_best_thresholds(
    gold_eval: list[str],
    equiv_probs: list[float],
    *,
    step: float = 0.01,
) -> dict[str, Any]:
    """Sweep [step, 1-step] and report thresholds maximizing different objectives.

    Each entry: {"threshold": float, "metrics": compute_metrics_dict(...)}.
    """
    if not gold_eval:
        return {}

    objectives = {
        "macro_f1": lambda m: float(m.get("macro_f1") or 0.0),
        "equiv_f1": lambda m: float(m.get("f1_equiv") or 0.0),
        "kappa": lambda m: float(m.get("kappa") or 0.0),
        "mcc": lambda m: float(m.get("mcc") or 0.0),
    }
    best: dict[str, dict[str, Any]] = {
        name: {"threshold": 0.5, "score": float("-inf"), "metrics": None} for name in objectives
    }

    t = step
    while t < 1.0:
        preds = thresholded_pred_labels(equiv_probs, t)
        m = compute_metrics_dict(gold_eval, preds)
        for name, score_fn in objectives.items():
            s = score_fn(m)
            if s > best[name]["score"]:
                best[name] = {"threshold": round(float(t), 4), "score": s, "metrics": m}
        t += step

    out: dict[str, Any] = {}
    for name, rec in best.items():
        out[name] = {
            "threshold": rec["threshold"],
            "score": rec["score"],
            "metrics": {k: v for k, v in (rec["metrics"] or {}).items() if k != "confusion"},
            "confusion_matrix": (rec["metrics"] or {}).get("confusion"),
        }
    return out


def best_threshold_precision_with_min_recall_equiv(
    gold_eval: list[str],
    equiv_probs: list[float],
    *,
    min_recall_equiv: float,
    step: float = 0.01,
) -> dict[str, Any] | None:
    """Pick θ that maximises precision_equiv among those with recall_equiv ≥ ``min_recall_equiv``.

    Returns None if no threshold satisfies the recall constraint (tiny validation sets).
    """
    if not gold_eval:
        return None
    best_prec = -1.0
    best_rec: dict[str, Any] | None = None
    t = step
    while t < 1.0:
        preds = thresholded_pred_labels(equiv_probs, t)
        m = compute_metrics_dict(gold_eval, preds)
        re = float(m.get("recall_equiv") or 0.0)
        if re >= min_recall_equiv - 1e-9:
            pe = float(m.get("precision_equiv") or 0.0)
            if pe > best_prec:
                best_prec = pe
                best_rec = {
                    "min_recall_equiv": min_recall_equiv,
                    "threshold": round(float(t), 4),
                    "precision_equiv": pe,
                    "recall_equiv": re,
                    "f1_equiv": m.get("f1_equiv"),
                    "macro_f1": m.get("macro_f1"),
                    "metrics": {k: v for k, v in m.items() if k != "confusion"},
                    "confusion_matrix": m.get("confusion"),
                }
        t += step
    return best_rec
