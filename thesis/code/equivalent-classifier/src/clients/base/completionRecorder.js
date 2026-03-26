import { createHash } from "node:crypto";
import { mkdir, appendFile } from "node:fs/promises";
import path from "node:path";

/**
 * SHA-256 of `system + "\0" + user` (UTF-8) for stable prompt identity without storing full text.
 * @param {string} systemPrompt
 * @param {string} userPrompt
 */
export function createPromptHash(systemPrompt, userPrompt) {
  return createHash("sha256")
    .update(`${systemPrompt}\0${userPrompt}`, "utf8")
    .digest("hex");
}

/**
 * @param {string} segment
 */
function sanitizeFilenameSegment(segment) {
  const s = String(segment ?? "unknown")
    .trim()
    .replace(/[/\\:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return s || "unknown";
}

/**
 * UTC instant safe for filenames (no `:` / `.` in the time portion).
 * @param {Date} [d]
 */
export function utcFilenameTimestamp(d = new Date()) {
  return d.toISOString().replace(/[:.]/g, "-");
}

/**
 * @param {object} p
 * @param {string} p.model
 * @param {string} p.templateKind e.g. zero-shot
 * @param {string} p.templateVersion e.g. v2
 * @param {string} p.contextLabel - e.g. from `contextLogLabel()` in `contextExtractor.js`
 * @param {Date} [p.date] - defaults to now (fixed when constructing the recorder)
 */
export function buildRunLogFilename({
  model,
  templateKind,
  templateVersion,
  contextLabel,
  date = new Date(),
}) {
  const dt = utcFilenameTimestamp(date);
  const tpl = `${sanitizeFilenameSegment(templateKind)}-${sanitizeFilenameSegment(templateVersion)}`;
  return `${dt}_${sanitizeFilenameSegment(model)}_${tpl}_${sanitizeFilenameSegment(contextLabel)}.jsonl`;
}

/**
 * Appends one JSON object per line under runs/…jsonl for comparing prompts, models, and token use.
 */
export class CompletionRecorder {
  /**
   * @param {object} opts
   * @param {string} [opts.runsDir] - directory for log files (default: ./runs from cwd)
   * @param {string} opts.model - must match the classifier model (used in filename)
   * @param {string} opts.templateKind - e.g. zero-shot, few-shot
   * @param {string} opts.templateVersion - e.g. v2
   * @param {string} opts.contextLabel - e.g. `lines-21` or `full` (see contextLogLabel)
   * @param {Date} [opts.startedAt] - timestamp embedded in the filename (default: construction time)
   */
  constructor({
    runsDir = path.join(process.cwd(), "runs"),
    model,
    templateKind,
    templateVersion,
    contextLabel,
    startedAt,
  }) {
    if (!model || !templateKind || !templateVersion || !contextLabel) {
      throw new Error(
        "CompletionRecorder: model, templateKind, templateVersion, and contextLabel are required"
      );
    }
    this.runsDir = runsDir;
    this.model = model;
    this.templateKind = templateKind;
    this.templateVersion = templateVersion;
    this.contextLabel = contextLabel;
    this.startedAt = startedAt ?? new Date();
    this.filePath = path.join(
      runsDir,
      buildRunLogFilename({
        model,
        templateKind,
        templateVersion,
        contextLabel,
        date: this.startedAt,
      })
    );
  }

  /**
   * Append one record (newline-delimited JSON).
   * @param {Record<string, unknown>} record
   */
  async append(record) {
    await mkdir(this.runsDir, { recursive: true });
    const payload = {
      ...record,
      contextLabel: this.contextLabel,
      timestamp: new Date().toISOString(),
    };
    await appendFile(this.filePath, `${JSON.stringify(payload)}\n`, "utf8");
  }
}
