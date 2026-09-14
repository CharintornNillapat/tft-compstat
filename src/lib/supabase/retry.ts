/**
 * Exponential-backoff retry for `fetch`, built for `getCachedSupabase()`
 * (`server.ts`) — the client behind every build-time prerendered read
 * (architecture §8). A transient Supabase Gateway Timeout has failed a real
 * deploy before (Phase 6 Task 12's build), and a `next build` is already the
 * slowest, least latency-sensitive path in the app, so trading a couple of
 * extra seconds for not failing the whole build on one flaky response is a
 * clear win there. It is deliberately **not** wired into the plain client
 * `getSupabase()` uses for `/me` and `/`'s uncached, latency-sensitive reads
 * (architecture §6.3) — retrying those would delay a live response ahead of
 * the error state those pages already handle.
 *
 * `now`/`sleep`-style injection follows `riot/limiter.ts`'s pattern, so the
 * backoff schedule is testable without a real clock or network.
 */

/** Worth retrying: a network hiccup or a transient server-side response. A real
 * PostgREST error from a bad query or an RLS denial (4xx, 404 included) is
 * returned on the first try — retrying it would just repeat the same failure
 * slower. */
const RETRIABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export type RetryingFetchOptions = {
  /** Total attempts including the first. Default 3 (so up to 2 retries). */
  attempts?: number;
  /** Base delay in ms; attempt `n` waits up to `baseMs * 2^n`. Default 300. */
  baseMs?: number;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Injectable for deterministic tests; defaults to `Math.random`. */
  random?: () => number;
};

/** Full jitter: attempt 0 waits `[0, baseMs)`, attempt 1 `[0, 2*baseMs)`, and so on. */
export function backoffDelayMs(attempt: number, baseMs: number, random: () => number = Math.random): number {
  return Math.round(baseMs * 2 ** attempt * random());
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Wraps `fetch` so a caller (supabase-js's `global.fetch` option) gets retries
 * for free. The first attempt is never delayed, so the common case — no
 * transient failure — costs nothing.
 */
export function createRetryingFetch(options: RetryingFetchOptions = {}): typeof fetch {
  const {
    attempts = 3,
    baseMs = 300,
    fetch: fetchImpl = fetch,
    sleep = defaultSleep,
    random = Math.random,
  } = options;

  return async (input, init) => {
    for (let attempt = 0; ; attempt++) {
      const isLastAttempt = attempt === attempts - 1;
      try {
        const response = await fetchImpl(input, init);
        if (isLastAttempt || !RETRIABLE_STATUS.has(response.status)) return response;
      } catch (error) {
        if (isLastAttempt) throw error;
      }
      await sleep(backoffDelayMs(attempt, baseMs, random));
    }
  };
}
