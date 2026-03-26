/**
 * Load versioned prompts and fill placeholders for the classifier.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(__dirname, "..");
const PROMPTS_ROOT = join(PACKAGE_ROOT, "prompts");

const ALLOWED_STYLES = new Set(["zero-shot", "few-shot"]);
const VERSION_RE = /^v\d+$/;

/**
 * @param {string} style - "zero-shot" | "few-shot"
 * @param {string} version - e.g. "v1", "v2"
 * @returns {{ meta: object, system: string, user: string, style: string, version: string, dir: string }}
 */
export function loadTemplate(style, version) {
  if (!ALLOWED_STYLES.has(style)) {
    throw new Error(
      `loadTemplate: unknown style "${style}". Expected one of: ${[...ALLOWED_STYLES].join(", ")}`
    );
  }
  if (!VERSION_RE.test(version)) {
    throw new Error(`loadTemplate: version must match v<number>, got "${version}"`);
  }

  const dir = join(PROMPTS_ROOT, style, version);
  if (!existsSync(dir)) {
    throw new Error(`Prompt directory not found: ${dir}`);
  }

  const metaPath = join(dir, "meta.json");
  const systemPath = join(dir, "system.txt");
  const userPath = join(dir, "user.txt");

  for (const p of [metaPath, systemPath, userPath]) {
    if (!existsSync(p)) {
      throw new Error(`Missing prompt file: ${p}`);
    }
  }

  const meta = JSON.parse(readFileSync(metaPath, "utf8"));
  const system = readFileSync(systemPath, "utf8").trimEnd();
  const user = readFileSync(userPath, "utf8");

  return { meta, system, user, style, version, dir };
}

/**
 * Replace {{key}} placeholders. Unknown keys are left unchanged.
 * @param {string} template
 * @param {Record<string, string>} vars
 */
export function fillTemplate(template, vars) {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{{${key}}}`).join(value ?? "");
  }
  return out;
}

/**
 * @param {{ system: string, user: string }} template - from loadTemplate
 * @param {Record<string, string>} row - CSV row (at least original, replacement)
 * @param {{ annotatedText: string }} contextResult - from `extractContext` (window number or `"full"`)
 * @returns {{ system: string, user: string }}
 */
export function buildPrompt(template, row, contextResult) {
  const vars = {
    original: row.original ?? "",
    replacement: row.replacement ?? "",
    context: contextResult.annotatedText ?? "",
  };
  return {
    system: fillTemplate(template.system, vars),
    user: fillTemplate(template.user, vars),
  };
}

export { PROMPTS_ROOT, PACKAGE_ROOT };
