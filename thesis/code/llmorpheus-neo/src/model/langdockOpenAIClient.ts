import axios, { AxiosResponse } from "axios";

/**
 * Langdock OpenAI-compatible chat completions client.
 * POSTs to `{base}/openai/{region}/v1/chat/completions` with the same shape as OpenAI Chat Completions.
 */
export type LangdockOpenAIChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LangdockOpenAIChatBody = {
  model: string;
  messages: LangdockOpenAIChatMessage[];
  temperature: number;
  max_tokens: number;
  top_p: number;
};

export class LangdockOpenAIClient {
  constructor(
    private readonly base: string,
    private readonly region: string,
    private readonly headers: Record<string, string>
  ) {}

  chatCompletionsUrl(): string {
    return `${this.base}/openai/${this.region}/v1/chat/completions`;
  }

  async createChatCompletion(
    body: LangdockOpenAIChatBody
  ): Promise<AxiosResponse<unknown>> {
    return axios.post(this.chatCompletionsUrl(), body, {
      headers: this.headers,
    });
  }
}
