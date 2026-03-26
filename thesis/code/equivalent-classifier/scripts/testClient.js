/**
 * Integration check: one real OpenAI call with structured output.
 * `OPENAI_API_KEY` is read from `.env` in the package root when `OpenAIClassifier` loads.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { extractContext, contextLogLabel } from "../src/contextExtractor.js";
import { loadTemplate, buildPrompt } from "../src/promptBuilder.js";
import { OpenAIClassifier } from "../src/clients/openai.js";
import { CompletionRecorder } from "../src/clients/base/completionRecorder.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.log(
      "Skip: add OPENAI_API_KEY to .env in the package root (or export it) to run the live test."
    );
    process.exit(0);
  }

  const csvPath = path.join(root, "data", "validation.csv");
  const csvText = await readFile(csvPath, "utf8");
  const rows = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
  });
  const row = rows[0];
  if (!row) {
    console.error("No rows in validation.csv");
    process.exit(1);
  }

  const templateKind = "zero-shot";
  const templateVersion = "v2";
  const template = loadTemplate(templateKind, templateVersion);
  const context = extractContext(
    row.project,
    row.file,
    Number(row.line),
    20
  );
  const { system, user } = buildPrompt(template, row, context);

  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const classifier = new OpenAIClassifier(model);
  const recorder = new CompletionRecorder({
    runsDir: path.join(root, "runs"),
    model,
    templateKind,
    templateVersion,
    contextLabel: contextLogLabel(context),
  });
  console.log(`Calling OpenAI (${model})…`);
  console.log(`Logging to ${recorder.filePath}`);
  const result = await classifier.classify(system, user, {
    recorder,
    meta: {
      project: row.project,
      file: row.file,
      line: row.line,
      split: "validation",
    },
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
