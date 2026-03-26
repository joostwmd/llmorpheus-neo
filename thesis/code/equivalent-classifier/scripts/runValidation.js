/**
 * Classify every row in data/validation.csv; append one JSONL record per row to runs/.
 *
 * Usage:
 *   npm run validate
 *   node scripts/runValidation.js --window=20
 *   node scripts/runValidation.js --full
 *   node scripts/runValidation.js --limit=5
 *   node scripts/runValidation.js --template=zero-shot --version=v2
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { extractContext, contextConfigLabel } from "../src/contextExtractor.js";
import { loadTemplate, buildPrompt } from "../src/promptBuilder.js";
import { OpenAIClassifier } from "../src/clients/openai.js";
import { CompletionRecorder } from "../src/clients/base/completionRecorder.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function parseArgs() {
  let window = 20;
  let fullFile = false;
  let templateKind = "zero-shot";
  let templateVersion = "v2";
  /** @type {number | null} */
  let limit = null;
  let failFast = false;

  for (const a of process.argv.slice(2)) {
    if (a === "--full") fullFile = true;
    if (a === "--fail-fast") failFast = true;
    if (a.startsWith("--window=")) {
      const n = Number(a.slice("--window=".length));
      if (Number.isFinite(n) && n >= 0) window = n;
    }
    if (a.startsWith("--template=")) {
      templateKind = a.slice("--template=".length).trim();
    }
    if (a.startsWith("--version=")) {
      templateVersion = a.slice("--version=".length).trim();
    }
    if (a.startsWith("--limit=")) {
      const n = Number(a.slice("--limit=".length));
      if (Number.isFinite(n) && n > 0) limit = n;
    }
  }

  const windowOrFull = fullFile ? "full" : window;
  return {
    windowOrFull,
    templateKind,
    templateVersion,
    limit,
    failFast,
  };
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error(
      "Set OPENAI_API_KEY in .env (package root) or in the environment."
    );
    process.exit(1);
  }

  const { windowOrFull, templateKind, templateVersion, limit, failFast } =
    parseArgs();
  const csvPath = path.join(root, "data", "validation.csv");
  const csvText = await readFile(csvPath, "utf8");
  let rows = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
  });
  if (limit != null) rows = rows.slice(0, limit);

  const template = loadTemplate(templateKind, templateVersion);
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const classifier = new OpenAIClassifier(model);
  const contextLabel = contextConfigLabel(windowOrFull);
  const recorder = new CompletionRecorder({
    runsDir: path.join(root, "runs"),
    model,
    templateKind,
    templateVersion,
    contextLabel,
  });

  console.log(
    `Validation run: ${rows.length} row(s) | model=${model} | ${templateKind}/${templateVersion} | context=${contextLabel}`
  );
  console.log(`Log file: ${recorder.filePath}`);

  let ok = 0;
  const failures = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const n = i + 1;
    const label = `${row.project} ${row.file}:${row.line} (id=${row.id})`;

    try {
      const context = extractContext(
        row.project,
        row.file,
        Number(row.line),
        windowOrFull
      );
      const { system, user } = buildPrompt(template, row, context);
      const result = await classifier.classify(system, user, {
        recorder,
        meta: {
          templateKind,
          templateVersion,
          project: row.project,
          file: row.file,
          line: row.line,
          split: "validation",
          mutantId: row.id,
          snippetLineCount: context.lines.length,
          groundTruthLabel: row.coding ?? null,
        },
      });
      ok += 1;
      console.log(
        `[${n}/${rows.length}] OK ${label} -> ${result.classification}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failures.push({ n, label, msg });
      console.error(`[${n}/${rows.length}] FAIL ${label}: ${msg}`);
      if (failFast) process.exit(1);
    }
  }

  console.log(`\nDone: ${ok}/${rows.length} succeeded, ${failures.length} failed.`);
  if (failures.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
