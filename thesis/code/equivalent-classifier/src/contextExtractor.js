/**
 * Extract source context from benchmark libs for a labeled mutant row.
 * CSV `line` is 1-indexed (matches editor / Stryker line numbers).
 */
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(__dirname, "..");
const BENCHMARK_LIBS = resolve(PACKAGE_ROOT, "..", "benchmarks", "libs");

const CLONE_HINT =
  "Run: thesis/code/benchmarks/clone-benchmarks.sh (from repo root) to clone missing benchmark sources.";

/**
 * @param {string} project
 * @param {string} file
 * @returns {string} absolute path to source file
 */
function resolveBenchmarkFilePath(project, file) {
  const projectDir = join(BENCHMARK_LIBS, project);
  if (!existsSync(projectDir)) {
    throw new Error(
      `Benchmark project directory not found: ${projectDir}\n${CLONE_HINT}`
    );
  }

  let st;
  try {
    st = statSync(projectDir);
  } catch (e) {
    throw new Error(`Cannot stat ${projectDir}: ${e.message}\n${CLONE_HINT}`);
  }

  if (!st.isDirectory()) {
    throw new Error(`Expected a directory for project "${project}": ${projectDir}`);
  }

  const filePath = join(projectDir, file);
  if (!existsSync(filePath)) {
    const isEmpty =
      existsSync(projectDir) &&
      statSync(projectDir).isDirectory() &&
      project === "Complex.js";
    const extra = isEmpty
      ? ` The "${project}" checkout may be empty.\n${CLONE_HINT}`
      : "";
    throw new Error(`Source file not found: ${filePath}${extra}`);
  }

  return filePath;
}

/**
 * @param {string[]} slice - contiguous lines (subset of file)
 * @param {number} anchorLine - 1-indexed line in file to mark with >>>
 * @param {number} startLine - 1-indexed line number of slice[0] in the file
 */
function buildAnnotatedText(slice, anchorLine, startLine) {
  const endLine = startLine + slice.length - 1;
  const width = String(endLine).length;
  const parts = [];
  for (let i = 0; i < slice.length; i++) {
    const ln = startLine + i;
    const marker = ln === anchorLine ? ">>>" : "   ";
    parts.push(`${marker} ${String(ln).padStart(width, " ")} | ${slice[i]}`);
  }
  return parts.join("\n");
}

/**
 * @typedef {{ filePath: string, anchorLine: number, startLine: number, endLine: number, lines: string[], annotatedText: string, scope: 'window' | 'full' }} ContextResult
 */

/**
 * @param {unknown} windowOrFull
 * @returns {boolean}
 */
function isFullFileMode(windowOrFull) {
  return (
    typeof windowOrFull === "string" &&
    windowOrFull.trim().toLowerCase() === "full"
  );
}

/**
 * Surrounding lines or entire file.
 *
 * @param {string} project - CSV `project` column
 * @param {string} file - CSV `file` column relative to project root
 * @param {number} line - 1-indexed anchor line
 * @param {number | string} [windowOrFull=10] - If a number: lines before and after the anchor (≥ 0). If the string `"full"` (any casing): entire file. Large files can exceed model context.
 * @returns {ContextResult}
 */
/**
 * Short label for run logs: `full` for whole-file context, else `lines-<n>` (actual lines in the snippet).
 * @param {{ scope: 'window' | 'full', lines: string[] }} ctx
 */
export function contextLogLabel(ctx) {
  if (ctx.scope === "full") return "full";
  return `lines-${ctx.lines.length}`;
}

export function extractContext(project, file, line, windowOrFull = 10) {
  const anchorLine = Number(line);
  if (!Number.isFinite(anchorLine) || anchorLine < 1) {
    throw new Error(`extractContext: invalid line number: ${line}`);
  }

  const filePath = resolveBenchmarkFilePath(project, file);
  const raw = readFileSync(filePath, "utf8");
  const allLines = raw.split(/\r?\n/);

  const idx = anchorLine - 1;
  if (idx >= allLines.length) {
    throw new Error(
      `Line ${anchorLine} is past end of file (${allLines.length} lines): ${filePath}`
    );
  }

  if (isFullFileMode(windowOrFull)) {
    const annotatedText = buildAnnotatedText(allLines, anchorLine, 1);
    return {
      filePath,
      anchorLine,
      startLine: 1,
      endLine: allLines.length,
      lines: allLines,
      annotatedText,
      scope: "full",
    };
  }

  const window = Number(windowOrFull);
  if (!Number.isFinite(window) || window < 0) {
    throw new Error(
      `extractContext: window must be a non-negative number or the string "full", got: ${JSON.stringify(windowOrFull)}`
    );
  }

  const startIdx = Math.max(0, idx - window);
  const endIdx = Math.min(allLines.length - 1, idx + window);
  const startLine = startIdx + 1;
  const endLine = endIdx + 1;
  const slice = allLines.slice(startIdx, endIdx + 1);
  const annotatedText = buildAnnotatedText(slice, anchorLine, startLine);

  return {
    filePath,
    anchorLine,
    startLine,
    endLine,
    lines: slice,
    annotatedText,
    scope: "window",
  };
}

/**
 * Same as `extractContext(project, file, line, "full")`.
 * @deprecated Prefer `extractContext(..., "full")`.
 */
export function extractFullFileContext(project, file, line) {
  return extractContext(project, file, line, "full");
}

export { BENCHMARK_LIBS, PACKAGE_ROOT };
