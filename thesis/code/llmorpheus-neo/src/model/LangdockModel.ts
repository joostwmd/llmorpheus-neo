import fs from "fs";
import axios from "axios";
import { performance } from "perf_hooks";
import {
  BenchmarkRateLimiter,
  FixedRateLimiter,
  RateLimiter,
} from "../util/promise-utils";
import { retry } from "../util/promise-utils";
import {
  IModel,
  IModelFailureCounter,
  PostOptions,
} from "./IModel";
import { defaultPostOptions } from "./IModel";
import { getEnv } from "../util/code-utils";
import { IQueryResult } from "./IQueryResult";
import { MetaInfo } from "../generator/MetaInfo";
import {
  LangdockBackend,
  langdockBaseUrl,
  langdockRegion,
  resolveLangdockBackend,
} from "./langdockRoutes";
import { LangdockOpenAIClient } from "./langdockOpenAIClient";

/**
 * Langdock multi-route client: OpenAI chat (via LangdockOpenAIClient), Anthropic Messages, Google generateContent.
 * Auth: LLMORPHEUS_LLM_AUTH_HEADERS (JSON). Base: LLMORPHEUS_LANGDOCK_BASE_URL (optional).
 * Region: LLMORPHEUS_LANGDOCK_REGION (eu|us, default eu).
 */
export class LangdockModel implements IModel {
  private static authHeaders(): Record<string, string> {
    return JSON.parse(getEnv("LLMORPHEUS_LLM_AUTH_HEADERS"));
  }

  protected instanceOptions: PostOptions;
  protected rateLimiter: RateLimiter;
  protected counter: IModelFailureCounter = { nrRetries: 0, nrFailures: 0 };

  constructor(
    private modelName: string,
    instanceOptions: PostOptions = {},
    private metaInfo: MetaInfo
  ) {
    this.instanceOptions = instanceOptions;
    if (metaInfo.benchmark) {
      console.log(
        `*** [Langdock] Using ${this.modelName} with benchmark rate limiter`
      );
      this.rateLimiter = new BenchmarkRateLimiter();
      metaInfo.nrAttempts = 3;
    } else if (metaInfo.rateLimit > 0) {
      this.rateLimiter = new FixedRateLimiter(metaInfo.rateLimit);
      console.log(
        `*** [Langdock] Using ${this.getModelName()} with rate limit: ${metaInfo.rateLimit}`
      );
    } else {
      this.rateLimiter = new FixedRateLimiter(0);
      console.log(`*** [Langdock] Using ${this.getModelName()} with no rate limit`);
    }
  }

  public getModelName(): string {
    return this.modelName;
  }

  public getTemperature(): number {
    if (this.instanceOptions.temperature === undefined) {
      return defaultPostOptions.temperature;
    }
    return this.instanceOptions.temperature;
  }

  public getMaxTokens(): number {
    if (this.instanceOptions.max_tokens === undefined) {
      return defaultPostOptions.max_tokens;
    }
    return this.instanceOptions.max_tokens;
  }

  public async query(
    prompt: string,
    requestPostOptions: PostOptions = {}
  ): Promise<IQueryResult> {
    const options: PostOptions = {
      ...defaultPostOptions,
      ...this.instanceOptions,
      ...requestPostOptions,
    };

    const systemPrompt = fs.readFileSync(
      `templates/${this.metaInfo.systemPrompt}`,
      "utf8"
    );

    const backend = resolveLangdockBackend(this.getModelName());
    const base = langdockBaseUrl();
    const region = langdockRegion();
    const headers = LangdockModel.authHeaders();

    performance.mark("llm-query-start");
    let res: { status: number; statusText: string; data: any };
    try {
      res = await retry(
        () =>
          this.rateLimiter.next(() =>
            this.dispatchRequest(backend, base, region, headers, {
              systemPrompt,
              prompt,
              options,
            })
          ),
        this.metaInfo.nrAttempts,
        () => {
          this.counter.nrRetries++;
        }
      );
    } catch (e: any) {
      if (e?.response?.status === 429) {
        console.error(`*** 429 error: ${e}`);
        this.counter.nrFailures++;
      }
      throw e;
    }

    performance.measure(
      `llm-query-langdock:${JSON.stringify({
        backend,
        options,
        promptLength: prompt.length,
      })}`,
      "llm-query-start"
    );

    if (res.status !== 200) {
      throw new Error(
        `Request failed with status ${res.status} and message ${res.statusText}`
      );
    }
    if (!res.data) {
      throw new Error("Response data is empty");
    }

    const normalized = this.normalizeResponse(backend, res.data);
    console.log(
      `*** prompt tokens: ${normalized.prompt_tokens}, completion tokens: ${normalized.completion_tokens}, total tokens: ${normalized.total_tokens}`
    );

    const completions = new Set<string>();
    completions.add(normalized.text);
    return {
      completions,
      prompt_tokens: normalized.prompt_tokens,
      completion_tokens: normalized.completion_tokens,
      total_tokens: normalized.total_tokens,
    };
  }

  private async dispatchRequest(
    backend: LangdockBackend,
    base: string,
    region: string,
    headers: Record<string, string>,
    args: {
      systemPrompt: string;
      prompt: string;
      options: PostOptions;
    }
  ): Promise<{ status: number; statusText: string; data: any }> {
    const { systemPrompt, prompt, options } = args;
    const model = this.getModelName();
    const temperature = options.temperature ?? defaultPostOptions.temperature;
    const maxTokens = options.max_tokens ?? defaultPostOptions.max_tokens;

    if (backend === "openai") {
      const openai = new LangdockOpenAIClient(base, region, headers);
      const body = {
        model,
        messages: [
          { role: "system" as const, content: systemPrompt },
          { role: "user" as const, content: prompt },
        ],
        temperature,
        max_tokens: maxTokens,
        top_p: options.top_p ?? defaultPostOptions.top_p,
      };
      return openai.createChatCompletion(body);
    }

    if (backend === "anthropic") {
      const url = `${base}/anthropic/${region}/v1/messages`;
      const anthropicTemp = Math.min(1, Math.max(0, temperature));
      const body = {
        model,
        max_tokens: Math.max(1, maxTokens),
        temperature: anthropicTemp,
        system: systemPrompt,
        messages: [{ role: "user", content: prompt }],
      };
      return axios.post(url, body, { headers });
    }

    // google
    const encModel = encodeURIComponent(model);
    const url = `${base}/google/${region}/v1beta/models/${encModel}:generateContent`;
    const body = {
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      systemInstruction: {
        role: "system",
        parts: [{ text: systemPrompt }],
      },
      generationConfig: {
        temperature,
        maxOutputTokens: Math.max(1, maxTokens),
        topP: options.top_p ?? defaultPostOptions.top_p,
      },
    };
    return axios.post(url, body, { headers });
  }

  private normalizeResponse(
    backend: LangdockBackend,
    data: any
  ): {
    text: string;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  } {
    if (backend === "openai") {
      const text = data.choices?.[0]?.message?.content;
      if (text == null) {
        throw new Error("OpenAI-shaped response missing choices[0].message.content");
      }
      const u = data.usage || {};
      return {
        text: String(text),
        prompt_tokens: u.prompt_tokens ?? 0,
        completion_tokens: u.completion_tokens ?? 0,
        total_tokens: u.total_tokens ?? (u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0),
      };
    }

    if (backend === "anthropic") {
      const text = extractAnthropicText(data.content);
      if (!text) {
        throw new Error("Anthropic response missing text content");
      }
      const u = data.usage || {};
      const inT = u.input_tokens ?? 0;
      const outT = u.output_tokens ?? 0;
      return {
        text,
        prompt_tokens: inT,
        completion_tokens: outT,
        total_tokens: inT + outT,
      };
    }

    const text = extractGoogleText(data);
    if (!text) {
      throw new Error("Google response missing candidate text");
    }
    const um = data.usageMetadata || {};
    const prompt_tokens = um.promptTokenCount ?? 0;
    const completion_tokens =
      um.candidatesTokenCount ?? um.outputTokenCount ?? 0;
    const total_tokens =
      um.totalTokenCount ?? prompt_tokens + completion_tokens;
    return {
      text,
      prompt_tokens,
      completion_tokens,
      total_tokens,
    };
  }

  public getFailureCounter(): IModelFailureCounter {
    return this.counter;
  }
}

function extractAnthropicText(content: unknown): string {
  if (!Array.isArray(content)) {
    return "";
  }
  const parts: string[] = [];
  for (const block of content as Array<{ type?: string; text?: string }>) {
    if (block && block.type === "text" && typeof block.text === "string") {
      parts.push(block.text);
    }
  }
  return parts.join("");
}

function extractGoogleText(data: any): string {
  const c = data.candidates?.[0]?.content?.parts;
  if (!Array.isArray(c)) {
    return "";
  }
  const texts: string[] = [];
  for (const p of c) {
    if (p && typeof p.text === "string") {
      texts.push(p.text);
    }
  }
  return texts.join("");
}
