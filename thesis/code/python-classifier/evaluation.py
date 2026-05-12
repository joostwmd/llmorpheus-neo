"""Metrics aligned with thesis/code/equivalent-classifier/src/evaluation/metrics.js."""

from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path


ClassLabel = str  # "EQUIVALENT" | "BEHAVIORAL_CHANGE"


def normalize_ground_truth_label(raw: object) -> ClassLabel | None:
    if raw is None:
        return None
    t = str(raw).strip().lower().replace(" ", "_")
    if t == "equivalent":
        return "EQUIVALENT"
    if t in ("behavioral_change", "behavioralchange", "behavior_change"):
        return "BEHAVIORAL_CHANGE"
    return None


def normalize_prediction_label(raw: object) -> ClassLabel | None:
    if raw is None:
        return None
    t = str(raw).strip().upper().replace(" ", "_")
    if t == "EQUIVALENT":
        return "EQUIVALENT"
    if t in ("BEHAVIORAL_CHANGE", "BEHAVIORALCHANGE"):
        return "BEHAVIORAL_CHANGE"
    return None


def load_labeled_csv(path: Path | str) -> list[dict[str, str]]:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    rows: list[dict[str, str]] = []
    reader = csv.DictReader(text.splitlines())
    for row in reader:
        rows.append({k: (v if v is not None else "") for k, v in row.items()})
    return rows


@dataclass
class ConfusionMatrix:
    TP: int
    FN: int
    FP: int
    TN: int


def build_confusion_matrix(pairs: list[tuple[ClassLabel, ClassLabel]]) -> ConfusionMatrix:
    tp = fn = fp = tn = 0
    for gold, pred in pairs:
        if gold == "EQUIVALENT" and pred == "EQUIVALENT":
            tp += 1
        elif gold == "EQUIVALENT" and pred == "BEHAVIORAL_CHANGE":
            fn += 1
        elif gold == "BEHAVIORAL_CHANGE" and pred == "EQUIVALENT":
            fp += 1
        elif gold == "BEHAVIORAL_CHANGE" and pred == "BEHAVIORAL_CHANGE":
            tn += 1
    return ConfusionMatrix(TP=tp, FN=fn, FP=fp, TN=tn)


def confusion_total(m: ConfusionMatrix) -> int:
    return m.TP + m.FN + m.FP + m.TN


def accuracy(m: ConfusionMatrix) -> float | None:
    n = confusion_total(m)
    if n == 0:
        return None
    return (m.TP + m.TN) / n


def precision_equiv(m: ConfusionMatrix) -> float | None:
    d = m.TP + m.FP
    if d == 0:
        return None
    return m.TP / d


def recall_equiv(m: ConfusionMatrix) -> float | None:
    d = m.TP + m.FN
    if d == 0:
        return None
    return m.TP / d


def f1_score(p: float | None, r: float | None) -> float | None:
    if p is None or r is None:
        return None
    if p == 0 and r == 0:
        return 0.0
    return (2 * p * r) / (p + r)


def cohens_kappa(m: ConfusionMatrix) -> float | None:
    n = confusion_total(m)
    if n == 0:
        return None
    p_o = (m.TP + m.TN) / n
    row_equiv = (m.TP + m.FN) / n
    row_beh = (m.FP + m.TN) / n
    col_equiv = (m.TP + m.FP) / n
    col_beh = (m.FN + m.TN) / n
    p_e = row_equiv * col_equiv + row_beh * col_beh
    if p_e >= 1 - 1e-15:
        return 1.0 if p_o == 1 else None
    return (p_o - p_e) / (1 - p_e)


def mcc(m: ConfusionMatrix) -> float | None:
    """Matthews correlation coefficient for the binary {EQUIVALENT, BEHAVIORAL_CHANGE} task."""
    if confusion_total(m) == 0:
        return None
    tp, tn, fp, fn = m.TP, m.TN, m.FP, m.FN
    num = (tp * tn) - (fp * fn)
    den_sq = (tp + fp) * (tp + fn) * (tn + fp) * (tn + fn)
    if den_sq <= 0:
        return 0.0
    return num / (den_sq ** 0.5)


def kappa_with_fp_penalty(m: ConfusionMatrix, lam: float = 0.5) -> float:
    """Primary GEPA score: agreement with human coders, minus a penalty for false equivalents.

    score = max(kappa, 0) - lam * (FP / N)

    Rationale: kappa measures agreement above chance (rewards correct TNs and TPs alike,
    penalizes the degenerate "always majority" baseline). The FP term explicitly punishes
    classifying behavioral changes as equivalent, which would corrupt RQ6 survival rates.
    """
    n = confusion_total(m)
    if n == 0:
        return 0.0
    k = cohens_kappa(m) or 0.0
    return k - lam * (m.FP / n)


def format_report(m: ConfusionMatrix, lam: float = 0.5) -> str:
    acc = accuracy(m)
    prec = precision_equiv(m)
    rec = recall_equiv(m)
    f1 = f1_score(prec, rec)
    kap = cohens_kappa(m)
    mc = mcc(m)
    score = kappa_with_fp_penalty(m, lam=lam)
    lines = [
        "Confusion Matrix (positive class = EQUIVALENT):",
        "",
        "                    Predicted",
        "                   EQUIV BEHAV_CHG",
        f"Actual EQUIV    {m.TP:8d} {m.FN:8d}     ({m.TP + m.FN})",
        f"Actual BEHAV    {m.FP:8d} {m.TN:8d}     ({m.FP + m.TN})",
        f"                ({m.TP + m.FP}) ({m.FN + m.TN})    ({confusion_total(m)})",
        "",
        "Metrics:",
        f"- Accuracy:     {100 * acc:.1f}%" if acc is not None else "- Accuracy:     n/a",
        f"- Precision:    {100 * prec:.1f}%" if prec is not None else "- Precision:    n/a",
        f"- Recall:       {100 * rec:.1f}%" if rec is not None else "- Recall:       n/a",
        f"- F1-Score:     {100 * f1:.1f}%" if f1 is not None else "- F1-Score:     n/a",
        f"- Cohen's κ:    {kap:.3f}" if kap is not None else "- Cohen's κ:    n/a",
        f"- MCC:          {mc:.3f}" if mc is not None else "- MCC:          n/a",
        f"- Score (κ − {lam}·FP/N): {score:.3f}",
    ]
    return "\n".join(lines)
