/**
 * Confusion matrix and classification metrics.
 * Positive class = EQUIVALENT (per thesis framing: TP = both say equivalent).
 */

/** @typedef {'EQUIVALENT' | 'BEHAVIORAL_CHANGE'} ClassLabel */

/**
 * @typedef {{
 *   TP: number,
 *   FN: number,
 *   FP: number,
 *   TN: number,
 * }} ConfusionMatrix
 */

/**
 * @param {Array<{ gold: ClassLabel, pred: ClassLabel }>} pairs
 * @returns {ConfusionMatrix}
 */
export function buildConfusionMatrix(pairs) {
  let TP = 0;
  let FN = 0;
  let FP = 0;
  let TN = 0;
  for (const { gold, pred } of pairs) {
    if (gold === "EQUIVALENT" && pred === "EQUIVALENT") TP += 1;
    else if (gold === "EQUIVALENT" && pred === "BEHAVIORAL_CHANGE") FN += 1;
    else if (gold === "BEHAVIORAL_CHANGE" && pred === "EQUIVALENT") FP += 1;
    else if (gold === "BEHAVIORAL_CHANGE" && pred === "BEHAVIORAL_CHANGE")
      TN += 1;
  }
  return { TP, FN, FP, TN };
}

/**
 * @param {ConfusionMatrix} m
 */
export function confusionTotal(m) {
  return m.TP + m.FN + m.FP + m.TN;
}

/**
 * @param {ConfusionMatrix} m
 */
export function calculateAccuracy(m) {
  const n = confusionTotal(m);
  if (n === 0) return null;
  return (m.TP + m.TN) / n;
}

/**
 * Precision for predicting EQUIVALENT: TP / (TP + FP)
 * @param {ConfusionMatrix} m
 */
export function calculatePrecision(m) {
  const d = m.TP + m.FP;
  if (d === 0) return null;
  return m.TP / d;
}

/**
 * Recall (sensitivity) for EQUIVALENT: TP / (TP + FN)
 * @param {ConfusionMatrix} m
 */
export function calculateRecall(m) {
  const d = m.TP + m.FN;
  if (d === 0) return null;
  return m.TP / d;
}

/**
 * @param {number | null} precision
 * @param {number | null} recall
 */
export function calculateF1Score(precision, recall) {
  if (precision == null || recall == null) return null;
  if (precision === 0 && recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

/**
 * Cohen's κ for 2×2 nominal agreement.
 * @param {ConfusionMatrix} m
 */
export function calculateCohensKappa(m) {
  const n = confusionTotal(m);
  if (n === 0) return null;

  const p_o = (m.TP + m.TN) / n;

  const row_equiv = (m.TP + m.FN) / n;
  const row_beh = (m.FP + m.TN) / n;
  const col_equiv = (m.TP + m.FP) / n;
  const col_beh = (m.FN + m.TN) / n;

  const p_e = row_equiv * col_equiv + row_beh * col_beh;

  if (p_e >= 1 - 1e-15) return p_o === 1 ? 1 : null;

  return (p_o - p_e) / (1 - p_e);
}

/**
 * @param {number | null} kappa
 */
export function kappaInterpretation(kappa) {
  if (kappa == null || Number.isNaN(kappa)) return "n/a";
  if (kappa < 0.2) return "Slight agreement";
  if (kappa <= 0.4) return "Fair";
  if (kappa <= 0.6) return "Moderate";
  if (kappa <= 0.8) return "Substantial";
  return "Almost perfect";
}

/**
 * @param {ClassLabel[]} labels
 */
export function analyzeClassDistribution(labels) {
  let equiv = 0;
  let beh = 0;
  for (const l of labels) {
    if (l === "EQUIVALENT") equiv += 1;
    else if (l === "BEHAVIORAL_CHANGE") beh += 1;
  }
  const n = equiv + beh;
  return {
    EQUIVALENT: equiv,
    BEHAVIORAL_CHANGE: beh,
    total: n,
    equivalentFraction: n > 0 ? equiv / n : null,
    behavioralFraction: n > 0 ? beh / n : null,
  };
}

/**
 * Accuracy if we always predicted the majority gold label (imbalance sanity check).
 * @param {{ EQUIVALENT: number, BEHAVIORAL_CHANGE: number, total: number }} dist
 * @returns {{ accuracy: number | null, label: 'EQUIVALENT' | 'BEHAVIORAL_CHANGE' | null, count: number }}
 */
export function majorityClassBaseline(dist) {
  const n = dist.total;
  if (n === 0) {
    return { accuracy: null, label: null, count: 0 };
  }
  const e = dist.EQUIVALENT;
  const b = dist.BEHAVIORAL_CHANGE;
  if (e > b) {
    return { accuracy: e / n, label: "EQUIVALENT", count: e };
  }
  if (b > e) {
    return { accuracy: b / n, label: "BEHAVIORAL_CHANGE", count: b };
  }
  return { accuracy: e / n, label: "EQUIVALENT", count: e };
}

/**
 * @param {ConfusionMatrix} m
 */
export function formatConfusionMatrixTable(m) {
  const row0 = m.TP + m.FN;
  const row1 = m.FP + m.TN;
  const col0 = m.TP + m.FP;
  const col1 = m.FN + m.TN;
  const n = confusionTotal(m);

  const pad = (s, w) => String(s).padStart(w);
  const w = 8;
  const lines = [
    "                    Predicted",
    `                ${pad("EQUIV", w)} ${pad("BEHAV_CHG", w)}`,
    `Actual EQUIV    ${pad(m.TP, w)} ${pad(m.FN, w)}     (${row0})`,
    `Actual BEHAV    ${pad(m.FP, w)} ${pad(m.TN, w)}     (${row1})`,
    `                (${col0}) (${col1})    (${n})`,
  ];
  return lines.join("\n");
}

/**
 * @param {number | null} x
 * @param {number} [digits=1]
 */
export function pct(x, digits = 1) {
  if (x == null || Number.isNaN(x)) return "n/a";
  return `${(100 * x).toFixed(digits)}%`;
}
