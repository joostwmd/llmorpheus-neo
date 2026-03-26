/**
 * Compare classifier JSONL runs to hand labels in validation.csv.
 *
 *   npm run evaluate -- --run=latest
 *   npm run evaluate -- --run=runs/foo.jsonl
 *   npm run evaluate -- --all-runs
 *   npm run evaluate -- --run=latest --format=json --output=report.json
 *   npm run evaluate -- --run=latest --output=report.txt     (table to file; still prints)
 *   npm run evaluate -- --run=latest --save                   (writes eval-reports/<run>.eval.txt)
 */
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parse } from "csv-parse/sync";
import {
  loadValidationGroundTruthById,
  loadValidationGroundTruthByCompositeKey,
  readJsonlRecords,
  alignRecords,
  summarizeRunPerformance,
  resolveRunPath,
  listRunFiles,
} from "../src/evaluation/dataLoader.js";
import {
  buildConfusionMatrix,
  confusionTotal,
  calculateAccuracy,
  calculatePrecision,
  calculateRecall,
  calculateF1Score,
  calculateCohensKappa,
  kappaInterpretation,
  analyzeClassDistribution,
  majorityClassBaseline,
  formatConfusionMatrixTable,
  pct,
} from "../src/evaluation/metrics.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.join(__dirname, "..");

function parseArgs() {
  /** @type {string | null} */
  let run = null;
  let allRuns = false;
  let format = "table";
  let verbose = false;
  /** @type {string | null} */
  let output = null;
  let saveDefault = false;
  let csvPath = path.join(pkgRoot, "data", "validation.csv");

  for (const a of process.argv.slice(2)) {
    if (a === "--all-runs") allRuns = true;
    if (a === "--verbose") verbose = true;
    if (a === "--save") saveDefault = true;
    if (a.startsWith("--run=")) run = a.slice("--run=".length).trim();
    if (a.startsWith("--format=")) {
      format = a.slice("--format=".length).trim().toLowerCase();
    }
    if (a.startsWith("--output=")) output = a.slice("--output=".length).trim();
    if (a.startsWith("--csv=")) csvPath = a.slice("--csv=".length).trim();
  }

  return { run, allRuns, format, verbose, output, saveDefault, csvPath };
}

function countCsvRows(csvPath) {
  const text = readFileSync(csvPath, "utf8");
  const rows = parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
  });
  return rows.length;
}

/**
 * @param {string} jsonlPath
 * @param {string} csvPath
 * @param {boolean} showAllIssues
 */
function evaluateOne(jsonlPath, csvPath, showAllIssues) {
  const byId = loadValidationGroundTruthById(csvPath);
  const byComposite = loadValidationGroundTruthByCompositeKey(csvPath);
  const records = readJsonlRecords(jsonlPath);
  const { pairs, issues } = alignRecords(records, byId, byComposite);
  const matrix = buildConfusionMatrix(pairs);
  const n = confusionTotal(matrix);
  const goldLabels = pairs.map((p) => p.gold);
  const distribution = analyzeClassDistribution(goldLabels);
  const accuracy = calculateAccuracy(matrix);
  const precision = calculatePrecision(matrix);
  const recall = calculateRecall(matrix);
  const f1 = calculateF1Score(precision, recall);
  const kappa = calculateCohensKappa(matrix);
  const perf = summarizeRunPerformance(records);
  const csvRowCount = countCsvRows(csvPath);
  const majorityBaseline = majorityClassBaseline(distribution);
  const deltaVsMajority =
    accuracy != null && majorityBaseline.accuracy != null
      ? accuracy - majorityBaseline.accuracy
      : null;

  let totalTokensDisplay = perf.sumTotalTokensReported;
  if (
    totalTokensDisplay == null &&
    perf.totalInputTokens != null &&
    perf.totalOutputTokens != null
  ) {
    totalTokensDisplay = perf.totalInputTokens + perf.totalOutputTokens;
  }

  return {
    runFile: path.resolve(jsonlPath),
    runBasename: path.basename(jsonlPath),
    csvRowCount,
    jsonlLineCount: records.length,
    alignedCount: pairs.length,
    issues,
    confusionMatrix: matrix,
    classDistribution: distribution,
    metrics: {
      accuracy,
      precision,
      recall,
      f1Score: f1,
      cohensKappa: kappa,
      kappaLabel: kappaInterpretation(kappa),
    },
    baselines: {
      majorityClassLabel: majorityBaseline.label,
      majorityClassCount: majorityBaseline.count,
      majorityClassAccuracy: majorityBaseline.accuracy,
      accuracyDeltaVsMajorityBaseline: deltaVsMajority,
    },
    performance: {
      averageLatencyMs: perf.averageLatencyMs,
      totalInputTokens: perf.totalInputTokens,
      totalOutputTokens: perf.totalOutputTokens,
      totalTokens: totalTokensDisplay,
      recordsWithLatency: perf.recordsWithLatency,
    },
    showAllIssues,
  };
}

/**
 * @param {ReturnType<typeof evaluateOne>} r
 * @returns {string}
 */
function formatTableString(r) {
  const m = r.confusionMatrix;
  const n = confusionTotal(m);
  const { metrics: met, classDistribution: dist, baselines: base } = r;

  const lines = [];
  const log = (s = "") => lines.push(s);

  log(`Evaluation report — ${new Date().toISOString()}`);
  log(`Run: ${r.runBasename}`);
  log("=".repeat(72));
  log("\nGround truth (aligned mutants only):");
  log(`- EQUIVALENT: ${dist.EQUIVALENT} (${pct(dist.equivalentFraction, 1)})`);
  log(
    `- BEHAVIORAL_CHANGE: ${dist.BEHAVIORAL_CHANGE} (${pct(dist.behavioralFraction, 1)})`
  );
  log(`- Aligned for metrics: ${r.alignedCount}`);
  log(`- Rows in validation.csv: ${r.csvRowCount}`);
  log(`- Lines in run file: ${r.jsonlLineCount}`);
  if (r.alignedCount < r.csvRowCount) {
    log(
      `  Note: ${r.csvRowCount - r.alignedCount} validation row(s) missing from this run (or failed).`
    );
  }

  log("\nClass imbalance — sanity baselines:");
  if (base.majorityClassAccuracy != null && base.majorityClassLabel) {
    log(
      `- Majority-class baseline: always predict ${base.majorityClassLabel} → ${pct(base.majorityClassAccuracy, 1)} (${base.majorityClassCount}/${n})`
    );
    log(
      "  (If model accuracy is close to this, it may be mostly predicting the common class.)"
    );
  }
  if (met.accuracy != null && base.majorityClassAccuracy != null) {
    const d = met.accuracy - base.majorityClassAccuracy;
    const sign = d >= 0 ? "+" : "";
    log(
      `- Model accuracy minus majority baseline: ${sign}${(100 * d).toFixed(2)} pp`
    );
  }

  log("\nConfusion Matrix (positive class = EQUIVALENT):\n");
  log(formatConfusionMatrixTable(m));

  log("\nMetrics:");
  const accStr =
    met.accuracy != null ? `${pct(met.accuracy, 1)} (${m.TP + m.TN}/${n})` : "n/a";
  const precStr =
    met.precision != null
      ? `${pct(met.precision, 1)} (${m.TP}/${m.TP + m.FP})`
      : "n/a";
  const recStr =
    met.recall != null
      ? `${pct(met.recall, 1)} (${m.TP}/${m.TP + m.FN})`
      : "n/a";
  const f1Str =
    met.f1Score != null ? `${(100 * met.f1Score).toFixed(1)}%` : "n/a";
  const kStr =
    met.cohensKappa != null
      ? `${met.cohensKappa.toFixed(3)} (${met.kappaLabel})`
      : "n/a";

  log(`- Accuracy:     ${accStr}`);
  log(`- Precision:    ${precStr}`);
  log(`- Recall:       ${recStr}`);
  log(`- F1-Score:     ${f1Str}`);
  log(`- Cohen's κ:    ${kStr}`);

  log("\nPerformance (JSONL aggregates):");
  const lat =
    r.performance.averageLatencyMs != null
      ? `${(r.performance.averageLatencyMs / 1000).toFixed(2)}s`
      : "n/a";
  log(`- Records used: ${r.alignedCount} (of ${r.jsonlLineCount} lines in file)`);
  log(`- Average latency: ${lat}`);
  const tin = r.performance.totalInputTokens;
  const tout = r.performance.totalOutputTokens;
  const ttot = r.performance.totalTokens;
  if (tin != null && tout != null) {
    log(
      `- Total tokens (sum): ${(ttot ?? tin + tout).toLocaleString()} (input: ${tin.toLocaleString()}, output: ${tout.toLocaleString()})`
    );
  } else {
    log("- Total tokens: n/a (older run format may lack token fields)");
  }

  if (r.issues.length > 0) {
    log(`\nWarnings (${r.issues.length}):`);
    const show = r.showAllIssues ? r.issues : r.issues.slice(0, 10);
    for (const line of show) log(`  - ${line}`);
    if (!r.showAllIssues && r.issues.length > 10) {
      log(`  ... and ${r.issues.length - 10} more (use --verbose)`);
    }
  }

  return lines.join("\n");
}

/**
 * @param {ReturnType<typeof evaluateOne>} r
 */
function toCsvRows(r) {
  const met = r.metrics;
  const b = r.baselines;
  return [
    ["metric", "value"],
    ["run", r.runBasename],
    ["alignedCount", String(r.alignedCount)],
    ["csvRowCount", String(r.csvRowCount)],
    ["jsonlLineCount", String(r.jsonlLineCount)],
    ["majorityClassLabel", b.majorityClassLabel ?? ""],
    ["majorityClassAccuracy", b.majorityClassAccuracy != null ? String(b.majorityClassAccuracy) : ""],
    ["accuracyDeltaVsMajorityBaseline", b.accuracyDeltaVsMajorityBaseline != null ? String(b.accuracyDeltaVsMajorityBaseline) : ""],
    ["TP", String(r.confusionMatrix.TP)],
    ["FN", String(r.confusionMatrix.FN)],
    ["FP", String(r.confusionMatrix.FP)],
    ["TN", String(r.confusionMatrix.TN)],
    ["accuracy", met.accuracy != null ? String(met.accuracy) : ""],
    ["precision", met.precision != null ? String(met.precision) : ""],
    ["recall", met.recall != null ? String(met.recall) : ""],
    ["f1Score", met.f1Score != null ? String(met.f1Score) : ""],
    ["cohensKappa", met.cohensKappa != null ? String(met.cohensKappa) : ""],
  ];
}

function main() {
  const { run, allRuns, format, verbose, output, saveDefault, csvPath } =
    parseArgs();

  if (!["table", "json", "csv"].includes(format)) {
    console.error('Use --format=table|json|csv');
    process.exit(1);
  }

  /** @type {string[]} */
  let paths = [];

  if (allRuns) {
    paths = listRunFiles(path.join(pkgRoot, "runs"));
    if (paths.length === 0) {
      console.error("No .jsonl files in runs/");
      process.exit(1);
    }
  } else {
    const arg = run ?? "latest";
    const resolved = resolveRunPath(pkgRoot, arg);
    if (!resolved) {
      console.error(`Run file not found: ${arg}`);
      process.exit(1);
    }
    paths = [resolved];
  }

  /** @type {ReturnType<typeof evaluateOne>[]} */
  const results = [];
  for (const p of paths) {
    results.push(evaluateOne(p, csvPath, verbose));
  }

  let out = "";

  if (format === "table") {
    out = results.map((r) => formatTableString(r)).join("\n");
    console.log(out);
  } else if (format === "json") {
    const stripForJson = (r) => {
      const { showAllIssues: _s, ...rest } = r;
      return rest;
    };
    const payload =
      results.length === 1 ? stripForJson(results[0]) : { runs: results.map(stripForJson) };
    out = JSON.stringify(payload, null, 2);
    if (!output) console.log(out);
  } else {
    for (let i = 0; i < results.length; i++) {
      if (i > 0) out += "\n";
      const rows = toCsvRows(results[i]);
      out += rows
        .map((row) =>
          row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")
        )
        .join("\n");
    }
    if (!output) console.log(out);
  }

  /** @type {string | null} */
  let outPath = output;
  if (saveDefault && !outPath) {
    if (allRuns || paths.length !== 1) {
      console.error("--save requires a single run (omit --all-runs).");
      process.exit(1);
    }
    const stem = path.basename(paths[0], ".jsonl");
    const ext = format === "json" ? "json" : format === "csv" ? "csv" : "txt";
    outPath = path.join(pkgRoot, "eval-reports", `${stem}.eval.${ext}`);
  }

  if (outPath) {
    mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
    writeFileSync(outPath, out, "utf8");
    console.error(`Wrote ${path.resolve(outPath)}`);
  }
}

main();
