import { expect } from "chai";
import {
  langdockBaseUrl,
  langdockEnabledFromEnv,
  langdockRegion,
  resolveLangdockBackend,
} from "../src/model/langdockRoutes";

describe("langdockRoutes", () => {
  describe("resolveLangdockBackend", () => {
    it("routes claude models to anthropic", () => {
      expect(resolveLangdockBackend("claude-sonnet-4-6-default")).to.equal(
        "anthropic"
      );
      expect(resolveLangdockBackend("anthropic/claude-3")).to.equal(
        "anthropic"
      );
    });

    it("routes gemini models to google", () => {
      expect(resolveLangdockBackend("gemini-2.5-flash")).to.equal("google");
      expect(resolveLangdockBackend("GOOGLE_GEMINI")).to.equal("google");
    });

    it("defaults to openai", () => {
      expect(resolveLangdockBackend("gpt-4o-mini")).to.equal("openai");
      expect(resolveLangdockBackend("")).to.equal("openai");
    });
  });

  describe("langdockBaseUrl", () => {
    const prev = process.env.LLMORPHEUS_LANGDOCK_BASE_URL;

    afterEach(() => {
      if (prev === undefined) {
        delete process.env.LLMORPHEUS_LANGDOCK_BASE_URL;
      } else {
        process.env.LLMORPHEUS_LANGDOCK_BASE_URL = prev;
      }
    });

    it("defaults when unset or blank", () => {
      delete process.env.LLMORPHEUS_LANGDOCK_BASE_URL;
      expect(langdockBaseUrl()).to.equal("https://api.langdock.com");
      process.env.LLMORPHEUS_LANGDOCK_BASE_URL = "  ";
      expect(langdockBaseUrl()).to.equal("https://api.langdock.com");
    });

    it("trims and strips trailing slash", () => {
      process.env.LLMORPHEUS_LANGDOCK_BASE_URL = " https://custom.example/ ";
      expect(langdockBaseUrl()).to.equal("https://custom.example");
    });
  });

  describe("langdockRegion", () => {
    const prev = process.env.LLMORPHEUS_LANGDOCK_REGION;

    afterEach(() => {
      if (prev === undefined) {
        delete process.env.LLMORPHEUS_LANGDOCK_REGION;
      } else {
        process.env.LLMORPHEUS_LANGDOCK_REGION = prev;
      }
    });

    it("defaults to eu", () => {
      delete process.env.LLMORPHEUS_LANGDOCK_REGION;
      expect(langdockRegion()).to.equal("eu");
    });

    it("accepts eu and us (case-insensitive)", () => {
      process.env.LLMORPHEUS_LANGDOCK_REGION = "US";
      expect(langdockRegion()).to.equal("us");
      process.env.LLMORPHEUS_LANGDOCK_REGION = " Eu ";
      expect(langdockRegion()).to.equal("eu");
    });

    it("falls back to eu for unknown values", () => {
      process.env.LLMORPHEUS_LANGDOCK_REGION = "ap-south-1";
      expect(langdockRegion()).to.equal("eu");
    });
  });

  describe("langdockEnabledFromEnv", () => {
    const prev = process.env.LLMORPHEUS_LANGDOCK;

    afterEach(() => {
      if (prev === undefined) {
        delete process.env.LLMORPHEUS_LANGDOCK;
      } else {
        process.env.LLMORPHEUS_LANGDOCK = prev;
      }
    });

    it("is false when unset", () => {
      delete process.env.LLMORPHEUS_LANGDOCK;
      expect(langdockEnabledFromEnv()).to.equal(false);
    });

    it("accepts 1, true, yes (case-insensitive)", () => {
      process.env.LLMORPHEUS_LANGDOCK = "1";
      expect(langdockEnabledFromEnv()).to.equal(true);
      process.env.LLMORPHEUS_LANGDOCK = "TRUE";
      expect(langdockEnabledFromEnv()).to.equal(true);
      process.env.LLMORPHEUS_LANGDOCK = " Yes ";
      expect(langdockEnabledFromEnv()).to.equal(true);
    });

    it("is false for other values", () => {
      process.env.LLMORPHEUS_LANGDOCK = "0";
      expect(langdockEnabledFromEnv()).to.equal(false);
    });
  });
});
