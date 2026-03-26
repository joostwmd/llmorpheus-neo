import OpenAI from "openai";
import { loadPackageEnv } from "../loadEnv.js";
import { RateLimiter } from "./base/rateLimiter.js";
import { createPromptHash } from "./base/completionRecorder.js";
import {
  CLASSIFICATION_SCHEMA,
  CLASSIFICATION_SCHEMA_DESCRIPTION,
  CLASSIFICATION_SCHEMA_NAME,
  isClassificationResult,
} from "./base/schema.js";

/**
 * @typedef {import("./base/completionRecorder.js").CompletionRecorder} CompletionRecorder
 */

/**
 * @typedef {{
 *   templateKind?: string,
 *   templateVersion?: string,
 *   project?: string,
 *   file?: string,
 *   line?: string | number,
 *   split?: "validation" | "test",
 *   mutantId?: string,
 *   snippetLineCount?: number,
 *   groundTruthLabel?: string,
 * }} ClassifyMeta
 */

/**
 * @typedef {{
 *   meta?: ClassifyMeta,
 *   recorder?: CompletionRecorder,
 * }} ClassifyOptions
 */

/** @typedef {"gpt-4o-mini" | "gpt-4o" | "gpt-4-turbo" | "gpt-4"} GptFourModel */

const ALLOWED_MODELS = new Set([
  "gpt-4o-mini",
  "gpt-4o",
  "gpt-4-turbo",
  "gpt-4",
]);

/**
 * Client-side pacing only (avoids accidental bursts). OpenAI account limits are usually much higher;
 * override with `OPENAI_REQUESTS_PER_MINUTE` (e.g. 2000 or 5000). On 429, `RateLimiter` still retries.
 */
function requestsPerMinuteFromEnv() {
  const raw = process.env.OPENAI_REQUESTS_PER_MINUTE;
  if (raw == null || String(raw).trim() === "") return 1000;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1000;
  return Math.min(Math.floor(n), 1_000_000);
}

loadPackageEnv();

/**
 * OpenAI chat classifier with JSON-schema structured output (GPT-4 family only).
 */
export class OpenAIClassifier {
  /**
   * Use env key: `new OpenAIClassifier()` or `new OpenAIClassifier("gpt-4o-mini")`.
   * Explicit key: `new OpenAIClassifier("sk-...", "gpt-4o-mini")`.
   *
   * @param {string | GptFourModel} [first] - API key, or a model name if it is in the allowed set
   * @param {GptFourModel} [second] - model when `first` is the API key
   */
  constructor(first, second) {
    /** @type {string | undefined} */
    let explicitKey;
    /** @type {GptFourModel} */
    let model;

    if (second !== undefined) {
      explicitKey =
        typeof first === "string" && first.length > 0 ? first : undefined;
      model = /** @type {GptFourModel} */ (second);
    } else if (first === undefined || first === null || first === "") {
      explicitKey = undefined;
      model = "gpt-4o-mini";
    } else if (ALLOWED_MODELS.has(/** @type {string} */ (first))) {
      explicitKey = undefined;
      model = /** @type {GptFourModel} */ (first);
    } else {
      explicitKey = /** @type {string} */ (first);
      model = "gpt-4o-mini";
    }

    const key =
      explicitKey !== undefined && explicitKey.length > 0
        ? explicitKey
        : process.env.OPENAI_API_KEY;
    if (!key || typeof key !== "string") {
      throw new Error(
        "OpenAIClassifier: set OPENAI_API_KEY in .env or pass the API key as the first argument"
      );
    }
    if (!ALLOWED_MODELS.has(model)) {
      throw new Error(
        `OpenAIClassifier: unsupported model "${model}". Allowed: ${[
          ...ALLOWED_MODELS,
        ].join(", ")}`
      );
    }
    this._client = new OpenAI({ apiKey: key });
    /** @type {GptFourModel} */
    this._model = model;
    this._limiter = new RateLimiter({
      requestsPerMinute: requestsPerMinuteFromEnv(),
      maxRetries: 5,
      initialRetryDelayMs: 1000,
    });
  }

  /**
   * @param {string} systemPrompt
   * @param {string} userPrompt
   * @param {ClassifyOptions} [options]
   * @returns {Promise<{ classification: 'EQUIVALENT' | 'BEHAVIORAL_CHANGE', reasoning: string }>}
   */
  async classify(systemPrompt, userPrompt, options = {}) {
    const { meta = {}, recorder = null } = options;
    const promptHash = createPromptHash(systemPrompt, userPrompt);
    const limiterStats = {};
    const t0 = Date.now();

    const completion = await this._limiter.execute(async () => {
      return this._client.chat.completions.create({
        model: this._model,
        temperature: 0,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: CLASSIFICATION_SCHEMA_NAME,
            description: CLASSIFICATION_SCHEMA_DESCRIPTION,
            strict: true,
            schema: CLASSIFICATION_SCHEMA,
          },
        },
      });
    }, limiterStats);

    const latencyMs = Date.now() - t0;
    const raw = messageContentToString(completion.choices[0]?.message?.content);
    if (raw === "") {
      throw new Error("OpenAIClassifier: empty completion content");
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(
        `OpenAIClassifier: response is not valid JSON (prefix): ${raw.slice(0, 200)}`
      );
    }

    const normalized = normalizeClassificationPayload(parsed);
    if (!isClassificationResult(normalized)) {
      throw new Error(
        "OpenAIClassifier: response does not match classification schema"
      );
    }

    const usage = completion.usage;
    const finishReason = completion.choices[0]?.finish_reason ?? null;

    if (recorder) {
      await recorder.append({
        provider: "openai",
        model: this._model,
        templateKind: meta.templateKind ?? recorder.templateKind ?? null,
        templateVersion: meta.templateVersion ?? recorder.templateVersion ?? null,
        promptHash,
        project: meta.project ?? null,
        file: meta.file ?? null,
        line: meta.line ?? null,
        split: meta.split ?? null,
        mutantId: meta.mutantId ?? null,
        snippetLineCount: meta.snippetLineCount ?? null,
        groundTruthLabel: meta.groundTruthLabel ?? null,
        classification: normalized.classification,
        reasoning: normalized.reasoning,
        inputTokens: usage?.prompt_tokens ?? null,
        outputTokens: usage?.completion_tokens ?? null,
        totalTokens: usage?.total_tokens ?? null,
        latencyMs,
        finishReason,
        retries: limiterStats.retries ?? 0,
      });
    }

    return {
      classification: normalized.classification,
      reasoning: normalized.reasoning,
    };
  }
}

/**
 * @param {unknown} content
 */
function messageContentToString(content) {
  if (content == null) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          return String(/** @type {{ text?: string }} */ (part).text ?? "");
        }
        return "";
      })
      .join("");
  }
  return String(content);
}

/**
 * @param {unknown} data
 * @returns {unknown}
 */
function normalizeClassificationPayload(data) {
  if (!data || typeof data !== "object") return data;
  const o = /** @type {Record<string, unknown>} */ (data);
  let classification = o.classification;
  if (typeof classification === "string") {
    const u = classification.trim().toUpperCase().replace(/\s+/g, "_");
    if (u === "BEHAVIORAL_CHANGE" || u === "BEHAVIORALCHANGE") {
      classification = "BEHAVIORAL_CHANGE";
    } else if (u === "EQUIVALENT") {
      classification = "EQUIVALENT";
    }
  }
  return { ...o, classification, reasoning: o.reasoning };
}
