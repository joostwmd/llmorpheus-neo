/**
 * Load validation CSV, JSONL runs, normalize labels, align predictions to ground truth.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { parse } from "csv-parse/sync";

/** @typedef {'EQUIVALENT' | 'BEHAVIORAL_CHANGE'} ClassLabel */

/**
 * Map CSV `coding` / human strings to canonical enum.
 * @param {unknown} raw
 * @returns {ClassLabel | null}
 */
export function normalizeGroundTruthLabel(raw) {
  if (raw == null) return null;
  const t = String(raw).trim().toLowerCase().replace(/\s+/g, "_");
  if (t === "equivalent") return "EQUIVALENT";
  if (
    t === "behavioral_change" ||
    t === "behavioralchange" ||
    t === "behavior_change"
  ) {
    return "BEHAVIORAL_CHANGE";
  }
  return null;
}

/**
 * @param {unknown} raw
 * @returns {ClassLabel | null}
 */
export function normalizePredictionLabel(raw) {
  if (raw == null) return null;
  const t = String(raw).trim().toUpperCase().replace(/\s+/g, "_");
  if (t === "EQUIVALENT") return "EQUIVALENT";
  if (t === "BEHAVIORAL_CHANGE" || t === "BEHAVIORALCHANGE") {
    return "BEHAVIORAL_CHANGE";
  }
  return null;
}

/**
 * @param {string} csvPath
 * @returns {Map<string, ClassLabel>} id -> gold
 */
export function loadValidationGroundTruthById(csvPath) {
  const text = readFileSync(csvPath, "utf8");
  const rows = parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
  });
  /** @type {Map<string, ClassLabel>} */
  const map = new Map();
  for (const row of rows) {
    const id = row.id != null ? String(row.id).trim() : "";
    const gold = normalizeGroundTruthLabel(row.coding);
    if (id && gold) map.set(id, gold);
  }
  return map;
}

/**
 * Fallback key when `mutantId` is missing in JSONL.
 * @param {string} project
 * @param {string} file
 * @param {string | number} line
 */
export function compositeRowKey(project, file, line) {
  return `${String(project ?? "").trim()}|${String(file ?? "").trim()}|${String(line ?? "").trim()}`;
}

/**
 * @param {string} csvPath
 * @returns {Map<string, ClassLabel>}
 */
export function loadValidationGroundTruthByCompositeKey(csvPath) {
  const text = readFileSync(csvPath, "utf8");
  const rows = parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
  });
  /** @type {Map<string, ClassLabel>} */
  const map = new Map();
  for (const row of rows) {
    const key = compositeRowKey(row.project, row.file, row.line);
    const gold = normalizeGroundTruthLabel(row.coding);
    if (key !== "||" && gold) map.set(key, gold);
  }
  return map;
}

/**
 * @param {string} jsonlPath
 * @returns {object[]}
 */
export function readJsonlRecords(jsonlPath) {
  const text = readFileSync(jsonlPath, "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    try {
      out.push(JSON.parse(lines[i]));
    } catch {
      throw new Error(`Invalid JSON on line ${i + 1} of ${jsonlPath}`);
    }
  }
  return out;
}

/**
 * @param {object} rec
 */
function inputTokensFromRecord(rec) {
  if (typeof rec.inputTokens === "number") return rec.inputTokens;
  if (typeof rec.promptTokens === "number") return rec.promptTokens;
  return null;
}

/**
 * @param {object} rec
 */
function outputTokensFromRecord(rec) {
  if (typeof rec.outputTokens === "number") return rec.outputTokens;
  if (typeof rec.completionTokens === "number") return rec.completionTokens;
  return null;
}

/**
 * Align JSONL records to gold labels.
 * @param {object[]} records
 * @param {Map<string, ClassLabel>} byId
 * @param {Map<string, ClassLabel>} byComposite
 */
export function alignRecords(records, byId, byComposite) {
  /** @type {Array<{ gold: ClassLabel, pred: ClassLabel, mutantId: string | null, key: string }>} */
  const pairs = [];
  /** @type {string[]} */
  const issues = [];

  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    const pred = normalizePredictionLabel(rec.classification);
    if (!pred) {
      issues.push(`Line ${i + 1}: missing or invalid classification`);
      continue;
    }

    let gold =
      rec.groundTruthLabel != null
        ? normalizeGroundTruthLabel(rec.groundTruthLabel)
        : null;

    const mid =
      rec.mutantId != null ? String(rec.mutantId).trim() : "";
    const ckey = compositeRowKey(
      rec.project,
      rec.file,
      rec.line ?? ""
    );

    if (!gold && mid && byId.has(mid)) gold = byId.get(mid) ?? null;
    if (!gold && ckey !== "||" && byComposite.has(ckey)) {
      gold = byComposite.get(ckey) ?? null;
    }

    if (!gold) {
      issues.push(
        `Line ${i + 1}: could not resolve ground truth (mutantId=${mid || "—"}, key=${ckey})`
      );
      continue;
    }

    pairs.push({
      gold,
      pred,
      mutantId: mid || null,
      key: mid || ckey,
    });
  }

  return { pairs, issues };
}

/**
 * @param {object[]} records
 */
export function summarizeRunPerformance(records) {
  let latencySum = 0;
  let latencyN = 0;
  let inSum = 0;
  let outSum = 0;
  let totalSum = 0;
  let tokenN = 0;

  for (const rec of records) {
    if (typeof rec.latencyMs === "number") {
      latencySum += rec.latencyMs;
      latencyN += 1;
    }
    const inp = inputTokensFromRecord(rec);
    const outp = outputTokensFromRecord(rec);
    const tot =
      typeof rec.totalTokens === "number" ? rec.totalTokens : null;
    if (inp != null && outp != null) {
      inSum += inp;
      outSum += outp;
      tokenN += 1;
    }
    if (tot != null) totalSum += tot;
  }

  return {
    averageLatencyMs: latencyN > 0 ? latencySum / latencyN : null,
    totalInputTokens: tokenN > 0 ? inSum : null,
    totalOutputTokens: tokenN > 0 ? outSum : null,
    sumTotalTokensReported:
      records.filter((r) => typeof r.totalTokens === "number").length > 0
        ? totalSum
        : null,
    recordsWithLatency: latencyN,
    recordsWithTokenBreakdown: tokenN,
  };
}

/**
 * @param {string} runsDir
 * @returns {string | null} absolute path to newest .jsonl
 */
export function findLatestRunFile(runsDir) {
  if (!existsSync(runsDir)) return null;
  const names = readdirSync(runsDir).filter((n) => n.endsWith(".jsonl"));
  if (names.length === 0) return null;
  let best = null;
  let bestM = -1;
  for (const n of names) {
    const p = join(runsDir, n);
    const st = statSync(p);
    const m = st.mtimeMs;
    if (m > bestM) {
      bestM = m;
      best = p;
    }
  }
  return best;
}

/**
 * @param {string} runsDir
 * @returns {string[]}
 */
export function listRunFiles(runsDir) {
  if (!existsSync(runsDir)) return [];
  return readdirSync(runsDir)
    .filter((n) => n.endsWith(".jsonl"))
    .map((n) => join(runsDir, n))
    .sort();
}

/**
 * Resolve user path: relative to cwd or absolute.
 * @param {string} pkgRoot
 * @param {string} runArg
 */
export function resolveRunPath(pkgRoot, runArg) {
  if (runArg === "latest") {
    const p = findLatestRunFile(join(pkgRoot, "runs"));
    return p;
  }
  const abs = resolve(runArg);
  if (existsSync(abs)) return abs;
  const underRuns = join(pkgRoot, runArg);
  if (existsSync(underRuns)) return resolve(underRuns);
  const underRunsOnly = join(pkgRoot, "runs", basename(runArg));
  if (existsSync(underRunsOnly)) return resolve(underRunsOnly);
  return null;
}
