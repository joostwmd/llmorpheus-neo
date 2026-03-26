/**
 * Split data/all-coded-mutants-final.csv by project (no row-level leakage).
 *
 * Chooses validation projects to balance `Equivalent` rate between
 * validation and test (deterministic brute force over project subsets).
 *
 * Writes:
 *   data/validation.csv
 *   data/test.csv
 *   data/split-manifest.json
 *
 *   npm run split
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA = join(ROOT, "data");
const SRC = join(DATA, "all-coded-mutants-final.csv");

/** ~36% of rows in validation (same target as previous 4-project layout). */
const TARGET_VALIDATION_ROW_FRACTION = 0.356;

/**
 * @param {string} field
 */
function escapeCsvField(field) {
  const s = field == null ? "" : String(field);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * @param {string} path
 * @param {Record<string, string>[]} rows
 * @param {string[]} fieldnames
 */
function writeCsv(path, rows, fieldnames) {
  const lines = [];
  lines.push(fieldnames.map(escapeCsvField).join(","));
  for (const row of rows) {
    lines.push(fieldnames.map((k) => escapeCsvField(row[k] ?? "")).join(","));
  }
  writeFileSync(path, `${lines.join("\n")}\n`, "utf8");
}

function main() {
  const raw = readFileSync(SRC, "utf8");
  /** @type {Record<string, string>[]} */
  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
  });

  if (rows.length === 0) {
    throw new Error(`No rows in ${SRC}`);
  }

  /** @type {Map<string, { n: number, eq: number }>} */
  const proj = new Map();
  for (const r of rows) {
    const p = r.project;
    if (!proj.has(p)) proj.set(p, { n: 0, eq: 0 });
    const o = proj.get(p);
    o.n += 1;
    if ((r.coding ?? "").trim() === "Equivalent") o.eq += 1;
  }

  const names = [...proj.keys()].sort();
  const nProj = names.length;
  const totalRows = rows.length;
  let totalEq = 0;
  for (const n of names) totalEq += proj.get(n).eq;

  const globalRate = totalRows > 0 ? totalEq / totalRows : 0;
  const stats = names.map((name) => {
    const o = proj.get(name);
    return [name, o.n, o.eq];
  });

  const targetValRows = TARGET_VALIDATION_ROW_FRACTION * totalRows;

  let bestMask = 0;
  let bestScore = Infinity;

  for (let mask = 1; mask < (1 << nProj) - 1; mask += 1) {
    let valN = 0;
    let valEq = 0;
    for (let i = 0; i < nProj; i++) {
      if (mask & (1 << i)) {
        const [, nr, eq] = stats[i];
        valN += nr;
        valEq += eq;
      }
    }
    const testN = totalRows - valN;
    const testEq = totalEq - valEq;
    if (testN <= 0 || valN <= 0) continue;

    const rv = valEq / valN;
    const rt = testEq / testN;
    const rateGap = (rv - rt) ** 2;
    const globalGap = (rv - globalRate) ** 2 + (rt - globalRate) ** 2;
    const sizePenalty = ((valN - targetValRows) / totalRows) ** 2;
    const score = rateGap + 0.25 * globalGap + 0.15 * sizePenalty;

    if (score < bestScore) {
      bestScore = score;
      bestMask = mask;
    }
  }

  /** @type {Set<string>} */
  const valProjects = new Set();
  for (let i = 0; i < nProj; i++) {
    if (bestMask & (1 << i)) valProjects.add(stats[i][0]);
  }
  const testProjects = new Set(names.filter((n) => !valProjects.has(n)));

  const valRows = rows.filter((r) => valProjects.has(r.project));
  const testRows = rows.filter((r) => testProjects.has(r.project));

  const fieldnames = Object.keys(rows[0]);
  writeCsv(join(DATA, "validation.csv"), valRows, fieldnames);
  writeCsv(join(DATA, "test.csv"), testRows, fieldnames);

  const countEq = (arr) =>
    arr.filter((r) => (r.coding ?? "").trim() === "Equivalent").length;
  const valEqCount = countEq(valRows);
  const testEqCount = countEq(testRows);

  const manifest = {
    split_method: "project_disjoint_label_balanced",
    description:
      "Validation projects chosen to minimize |equiv_rate_val - equiv_rate_test| " +
      "while keeping validation row count near target_validation_row_fraction.",
    target_validation_row_fraction: TARGET_VALIDATION_ROW_FRACTION,
    global_equiv_rate: Math.round(globalRate * 1e6) / 1e6,
    validation_projects: [...valProjects].sort(),
    test_projects: [...testProjects].sort(),
    row_counts: {
      full: totalRows,
      validation: valRows.length,
      test: testRows.length,
    },
    equivalent_counts: {
      full: totalEq,
      validation: valEqCount,
      test: testEqCount,
    },
    equivalent_rate_by_split: {
      full: totalRows ? Math.round((totalEq / totalRows) * 1e6) / 1e6 : 0,
      validation: valRows.length
        ? Math.round((valEqCount / valRows.length) * 1e6) / 1e6
        : 0,
      test: testRows.length
        ? Math.round((testEqCount / testRows.length) * 1e6) / 1e6
        : 0,
    },
    optimization_score: Math.round(bestScore * 1e8) / 1e8,
  };

  writeFileSync(
    join(DATA, "split-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );
  console.log(JSON.stringify(manifest, null, 2));
}

main();
