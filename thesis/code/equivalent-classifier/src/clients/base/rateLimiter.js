/**
 * Shared rate limiting + retry wrapper for LLM provider clients.
 * Serializes requests and spaces them by requestsPerMinute; retries transient errors.
 */

/**
 * @param {unknown} err
 * @returns {boolean}
 */
function isRetriableError(err) {
  const status =
    err?.status ??
    err?.response?.status ??
    err?.cause?.status ??
    err?.error?.status;
  if (status === 429 || status === 503 || status === 502) return true;
  if (status === 500) return true;
  const code = err?.code;
  if (code === "ECONNRESET" || code === "ETIMEDOUT" || code === "ENOTFOUND")
    return true;
  const msg = String(err?.message ?? "").toLowerCase();
  if (msg.includes("rate limit") || msg.includes("timeout")) return true;
  return false;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export class RateLimiter {
  /**
   * @param {object} [opts]
   * @param {number} [opts.requestsPerMinute=60] - max completed requests per rolling minute spacing (serial queue)
   * @param {number} [opts.maxRetries=3] - retries after a failed attempt (rate limit / transient)
   * @param {number} [opts.initialRetryDelayMs=1000] - base delay for exponential backoff
   */
  constructor({
    requestsPerMinute = 60,
    maxRetries = 3,
    initialRetryDelayMs = 1000,
  } = {}) {
    if (requestsPerMinute <= 0) {
      throw new Error("RateLimiter: requestsPerMinute must be positive");
    }
    this.minIntervalMs = Math.ceil(60_000 / requestsPerMinute);
    this.maxRetries = maxRetries;
    this.initialRetryDelayMs = initialRetryDelayMs;
    /** @type {Promise<unknown>} */
    this._chain = Promise.resolve();
    this._lastRequestEnd = 0;
  }

  /**
   * Run `fn` through the limiter queue with spacing and retries.
   * @template T
   * @param {() => Promise<T>} fn
   * @param {{ retries?: number } | null} [stats] - if provided, `stats.retries` is set to the number of retried attempts after transient failures before success
   * @returns {Promise<T>}
   */
  async execute(fn, stats = null) {
    const run = async () => {
      const now = Date.now();
      const wait = Math.max(0, this._lastRequestEnd + this.minIntervalMs - now);
      if (wait > 0) await sleep(wait);

      let attempt = 0;
      while (true) {
        try {
          const result = await fn();
          this._lastRequestEnd = Date.now();
          if (stats) stats.retries = attempt;
          return result;
        } catch (err) {
          if (!isRetriableError(err) || attempt >= this.maxRetries) {
            throw err;
          }
          const backoff =
            this.initialRetryDelayMs * 2 ** attempt + Math.random() * 250;
          await sleep(backoff);
          attempt += 1;
        }
      }
    };

    const p = this._chain.then(run, run);
    this._chain = p.then(
      () => {},
      () => {}
    );
    return p;
  }
}
