/**
 * Map Langdock model IDs to which Langdock HTTP API surface to use.
 * @see https://docs.langdock.com — OpenAI, Anthropic Messages, Google generateContent
 */
export type LangdockBackend = "openai" | "anthropic" | "google";

export function resolveLangdockBackend(modelId: string): LangdockBackend {
  const m = modelId.toLowerCase();
  if (m.includes("claude")) {
    return "anthropic";
  }
  if (m.includes("gemini")) {
    return "google";
  }
  return "openai";
}

export function langdockBaseUrl(): string {
  const raw = process.env.LLMORPHEUS_LANGDOCK_BASE_URL;
  const trimmed = (raw || "").trim();
  return trimmed.length > 0 ? trimmed.replace(/\/$/, "") : "https://api.langdock.com";
}

export function langdockRegion(): string {
  const r = (process.env.LLMORPHEUS_LANGDOCK_REGION || "eu").trim().toLowerCase();
  if (r === "us" || r === "eu") {
    return r;
  }
  return "eu";
}

/**
 * Same effect as CLI `--langdock`: use Langdock for all models, including OpenAI-style IDs
 * (Langdock OpenAI-compatible chat/completions route).
 */
export function langdockEnabledFromEnv(): boolean {
  const v = (process.env.LLMORPHEUS_LANGDOCK || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}
