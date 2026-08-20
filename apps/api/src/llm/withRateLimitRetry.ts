const RATE_LIMIT_WAIT_PATTERN = /try again in ([\d.]+)s/i;
const MAX_RATE_LIMIT_RETRIES = 4;

/**
 * Groq's free tier shares one small tokens-per-minute bucket across every
 * call made with a given model — storyboard planning and concurrent scene
 * codegen all draw from the same 8K TPM pool, so a burst of calls (e.g. the
 * storyboard expansion loop, or several scenes generating in parallel) can
 * legitimately exhaust it even under normal use. Groq's 429 body names the
 * exact wait ("Please try again in 24.3s"); parse and honor that instead of
 * failing outright, since the budget reliably frees up on its own.
 */
export async function withRateLimitRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const message = err instanceof Error ? err.message : String(err);
      if (!/rate limit/i.test(message) || attempt === MAX_RATE_LIMIT_RETRIES) throw err;

      const match = message.match(RATE_LIMIT_WAIT_PATTERN);
      const waitMs = match ? Math.ceil(parseFloat(match[1]) * 1000) + 1000 : 5000 * (attempt + 1);
      console.warn(`[llm] rate limited, retrying in ${waitMs}ms (attempt ${attempt + 1}/${MAX_RATE_LIMIT_RETRIES})`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  throw lastErr;
}
