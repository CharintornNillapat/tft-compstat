import { z } from "zod"; // value import: prettifyError runs at runtime
import type { RiotPlatform } from "@/lib/env";
import { AuthError, BudgetExceeded, NotFoundError, RateLimited, ServerError } from "./errors";
import { parseRateLimitHeaders, retryAfterSeconds, type RateLimitSnapshot } from "./headers";
import { RateLimiter } from "./limiter";

/**
 * Typed Riot transport (architecture §5.2). Every call goes through the limiter and
 * the per-run budget, and every response's rate-limit headers are captured for
 * `sync_state.last_rate_limit`.
 *
 * The key travels in `X-Riot-Token`, never in a URL, so it can't reach a log line.
 */

/** Hard cap per sync run (§5.2 layer 2): 1 ids + 20 matches + league + summoner, with slack. */
export const CALL_BUDGET = 25;

/** A 429 this short is worth waiting out inline; anything longer ends the run. */
const INLINE_RETRY_MAX_S = 3;

export type RiotClientOptions = {
  apiKey: string;
  platform: RiotPlatform;
  /** Max calls for the lifetime of this client. */
  budget?: number;
  limiter?: RateLimiter;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Request timeout; Vercel functions are short-lived. */
  timeoutMs?: number;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class RiotClient {
  readonly platform: RiotPlatform;
  readonly #apiKey: string;
  readonly #budget: number;
  readonly #limiter: RateLimiter;
  readonly #fetch: typeof fetch;
  readonly #sleep: (ms: number) => Promise<void>;
  readonly #timeoutMs: number;

  #calls = 0;
  #lastRateLimit: RateLimitSnapshot | undefined;

  constructor(options: RiotClientOptions) {
    this.platform = options.platform;
    this.#apiKey = options.apiKey;
    this.#budget = options.budget ?? CALL_BUDGET;
    this.#limiter = options.limiter ?? new RateLimiter();
    this.#fetch = options.fetchImpl ?? globalThis.fetch;
    this.#sleep = options.sleep ?? defaultSleep;
    this.#timeoutMs = options.timeoutMs ?? 10_000;
  }

  /** Calls spent so far — `sync_state.last_call_count`. */
  get calls(): number {
    return this.#calls;
  }

  get remainingBudget(): number {
    return Math.max(0, this.#budget - this.#calls);
  }

  /** Rate-limit headers from the most recent response, for observability. */
  get lastRateLimit(): RateLimitSnapshot | undefined {
    return this.#lastRateLimit;
  }

  /** Fetches and validates. Returns the parsed value only. */
  async get<T extends z.ZodType>(url: string, schema: T, what: string): Promise<z.infer<T>> {
    return this.parse(await this.getRaw(url), schema, what);
  }

  /**
   * Fetches without validating, for responses stored verbatim (`matches.raw`).
   * The caller parses the subset it needs.
   */
  async getRaw(url: string): Promise<unknown> {
    return this.#limiter.run(() => this.#attempt(url, 0));
  }

  parse<T extends z.ZodType>(value: unknown, schema: T, what: string): z.infer<T> {
    const result = schema.safeParse(value);
    if (!result.success) {
      throw new Error(`Unexpected Riot response (${what}):\n${z.prettifyError(result.error)}`);
    }
    return result.data;
  }

  async #attempt(url: string, retries: number): Promise<unknown> {
    if (this.#calls >= this.#budget) throw new BudgetExceeded(this.#budget);
    this.#calls++;

    let response: Response;
    try {
      response = await this.#fetch(url, {
        headers: { "X-Riot-Token": this.#apiKey, Accept: "application/json" },
        signal: AbortSignal.timeout(this.#timeoutMs),
        cache: "no-store",
      });
    } catch (cause) {
      // Network failure or timeout: one retry, then give up for this run.
      if (retries === 0 && this.remainingBudget > 0) {
        await this.#sleep(500);
        return this.#attempt(url, retries + 1);
      }
      throw new ServerError(`Request failed: ${(cause as Error).message}`, 0, url);
    }

    this.#lastRateLimit = parseRateLimitHeaders(response.headers);

    if (response.ok) return response.json();

    if (response.status === 429) {
      const retryAfterS = retryAfterSeconds(response.headers);
      const limitType = response.headers.get("x-rate-limit-type") ?? undefined;
      this.#lastRateLimit = { ...this.#lastRateLimit, retryAfterS, limitType };
      // Short stalls are worth absorbing; long ones end the run with partial progress intact.
      if (retryAfterS <= INLINE_RETRY_MAX_S && retries === 0 && this.remainingBudget > 0) {
        this.#limiter.pauseFor(retryAfterS * 1_000);
        await this.#sleep(retryAfterS * 1_000);
        return this.#attempt(url, retries + 1);
      }
      throw new RateLimited(retryAfterS, response.status, url, limitType);
    }

    if (response.status === 401 || response.status === 403) throw new AuthError(response.status, url);
    if (response.status === 404) throw new NotFoundError(url);

    if (response.status >= 500) {
      if (retries === 0 && this.remainingBudget > 0) {
        await this.#sleep(500);
        return this.#attempt(url, retries + 1);
      }
      throw new ServerError(`Riot server error ${response.status}`, response.status, url);
    }

    throw new ServerError(`Unexpected status ${response.status}`, response.status, url);
  }
}
