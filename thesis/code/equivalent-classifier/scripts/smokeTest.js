/**
 * End-to-end smoke test: load 3 rows from validation CSV, extract context, build prompts.
 */
import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";
import { extractContext } from "../src/contextExtractor.js";
import { loadTemplate, buildPrompt } from "../src/promptBuilder.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const CSV_PATH = join(ROOT, "data", "validation.csv");

function parseArgs() {
  let window = 10;
  let fullFile = false;
  for (const a of process.argv.slice(2)) {
    if (a === "--full") fullFile = true;
    if (a.startsWith("--window=")) {
      const n = Number(a.slice("--window=".length));
      if (Number.isFinite(n) && n >= 0) window = n;
    }
  }
  return { window, fullFile };
}

function loadRows() {
  const raw = readFileSync(CSV_PATH, "utf8");
  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
  });
  return rows;
}

function pickSample(rows, project, predicate) {
  const r = rows.find((row) => row.project === project && predicate(row));
  if (!r) {
    throw new Error(`No row found for project ${project} matching predicate`);
  }
  return r;
}

function formatContextForTerminal(ctx, maxLines = 45) {
  if (ctx.lines.length <= maxLines) return ctx.annotatedText;
  const head = ctx.lines.slice(0, 20);
  const tail = ctx.lines.slice(-10);
  const w = String(ctx.endLine).length;
  const headEndLine = ctx.startLine + head.length - 1;
  const tailStartLine = ctx.endLine - tail.length + 1;
  const anchorInGap = ctx.anchorLine > headEndLine && ctx.anchorLine < tailStartLine;

  const headText = head
    .map((line, i) => {
      const ln = ctx.startLine + i;
      const marker = ln === ctx.anchorLine ? ">>>" : "   ";
      return `${marker} ${String(ln).padStart(w, " ")} | ${line}`;
    })
    .join("\n");
  const tailText = tail
    .map((line, i) => {
      const ln = tailStartLine + i;
      const marker = ln === ctx.anchorLine ? ">>>" : "   ";
      return `${marker} ${String(ln).padStart(w, " ")} | ${line}`;
    })
    .join("\n");
  const gapNote = anchorInGap
    ? `\n   ${" ".repeat(w)} | … (lines omitted; >>> anchor line ${ctx.anchorLine} is above) …`
    : `\n   ${" ".repeat(w)} | … (${ctx.lines.length - 30} lines omitted) …`;
  return `${headText}${gapNote}\n${tailText}`;
}

function main() {
  const { window, fullFile } = parseArgs();
  if (fullFile) {
    console.log("Context mode: full file (terminal preview may be truncated)\n");
  } else {
    console.log(`Context mode: window ±${window} lines\n`);
  }

  const rows = loadRows();
  const samples = [
    {
      note: "crawler-url-parser — first row",
      row: rows[0],
    },
    {
      note: "node-jsonfile — first row",
      row: pickSample(rows, "node-jsonfile", () => true),
    },
    {
      note: "pull-stream — first row",
      row: pickSample(rows, "pull-stream", () => true),
    },
  ];
  const configs = [
    ["zero-shot", "v1"],
    ["zero-shot", "v2"],
    ["few-shot", "v1"],
    ["few-shot", "v2"],
  ];

  for (const { note, row } of samples) {
    console.log("\n########################################");
    console.log("# SAMPLE:", note);
    console.log("########################################");
    console.log(
      "project:",
      row.project,
      "| file:",
      row.file,
      "| anchor line:",
      row.line,
      "| label:",
      row.coding
    );

    let ctx;
    try {
      ctx = extractContext(
        row.project,
        row.file,
        Number(row.line),
        fullFile ? "full" : window
      );
    } catch (e) {
      console.error("Context extraction failed:", e.message);
      continue;
    }

    console.log("\n--- extracted context (as injected into {{context}}) ---");
    console.log("scope:", ctx.scope);
    console.log("source:", ctx.filePath);
    console.log(
      `lines ${ctx.startLine}–${ctx.endLine} (${ctx.lines.length} lines), anchor >>> ${ctx.anchorLine}\n`
    );
    const display =
      ctx.scope === "full" && ctx.lines.length > 45
        ? formatContextForTerminal(ctx)
        : ctx.annotatedText;
    console.log(display);
    console.log("--- end context ---\n");

    for (const [style, version] of configs) {
      const tmpl = loadTemplate(style, version);
      const { system, user } = buildPrompt(tmpl, row, ctx);
      console.log(`>> ${style} ${version} | system ${system.length} chars | user ${user.length} chars`);
      console.log(
        "   user preview (first 280 chars):",
        JSON.stringify(user.slice(0, 280)) + (user.length > 280 ? "…" : "")
      );
    }
  }

  console.log("\nSmoke test finished.\n");
}

main();
