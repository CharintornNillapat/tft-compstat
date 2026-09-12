/**
 * Dual sliding-window rate limiter (architecture §5.2 layer 4). Pure apart from the
 * injected clock, so tests drive it deterministically.
 *
 * Riot's personal/development limits are 20 requests/1s and 100/120s. The defaults
 * here sit under both, which leaves headroom for a request that Riot counts but we
 * never see the response to (a timeout, a dropped connection).
 */

export type LimiterWindow = { limit: number; windowMs: number };

/** Conservative budgets: Riot allows 20/1s and 100/120s. */
export const RIOT_WINDOWS: readonly LimiterWindow[] = [
  { limit: 15, windowMs: 1_000 },
  { limit: 80, windowMs: 120_000 },
];

export const RIOT_CONCURRENCY = 3;

export type LimiterOptions = {
  windows?: readonly LimiterWindow[];
  concurrency?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class RateLimiter {
  readonly #windows: readonly LimiterWindow[];
  /** Timestamps of admitted calls, one array per window, oldest first. */
  readonly #hits: number[][];
  readonly #concurrency: number;
  readonly #now: () => number;
  readonly #sleep: (ms: number) => Promise<void>;

  #inFlight = 0;
  #waiters: (() => void)[] = [];
  #pausedUntil = 0;
  /** Admission is serialized, so two callers can't both pass a window check. */
  #gate: Promise<unknown> = Promise.resolve();

  constructor(options: LimiterOptions = {}) {
    this.#windows = options.windows ?? RIOT_WINDOWS;
    this.#hits = this.#windows.map(() => []);
    this.#concurrency = options.concurrency ?? RIOT_CONCURRENCY;
    this.#now = options.now ?? Date.now;
    this.#sleep = options.sleep ?? defaultSleep;
  }

  /** Runs `fn` once a slot is free in every window. */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    const admitted = this.#gate.then(() => this.#admit());
    // Keep the chain alive even if one admission rejects.
    this.#gate = admitted.catch(() => {});
    await admitted;
    try {
      return await fn();
    } finally {
      this.#inFlight--;
      this.#waiters.shift()?.();
    }
  }

  /**
   * Holds every later call for `ms`, for a 429's `Retry-After`. Calls already in
   * flight are unaffected; the caller decides whether to retry them.
   */
  pauseFor(ms: number): void {
    this.#pausedUntil = Math.max(this.#pausedUntil, this.#now() + ms);
  }

  /** Calls admitted in the shortest window — what `X-App-Rate-Limit-Count` should echo. */
  get recentCalls(): number {
    this.#prune();
    return this.#hits[0]?.length ?? 0;
  }

  async #admit(): Promise<void> {
    while (this.#inFlight >= this.#concurrency) {
      await new Promise<void>((resolve) => this.#waiters.push(resolve));
    }
    for (let wait = this.#waitMs(); wait > 0; wait = this.#waitMs()) {
      await this.#sleep(wait);
    }
    const now = this.#now();
    for (const hits of this.#hits) hits.push(now);
    this.#inFlight++;
  }

  #prune(): void {
    const now = this.#now();
    this.#windows.forEach((window, i) => {
      const hits = this.#hits[i]!;
      let expired = 0;
      while (expired < hits.length && hits[expired]! <= now - window.windowMs) expired++;
      if (expired > 0) hits.splice(0, expired);
    });
  }

  /** How long until a slot frees up in every window, 0 if one is free now. */
  #waitMs(): number {
    this.#prune();
    const now = this.#now();
    let wait = Math.max(0, this.#pausedUntil - now);
    this.#windows.forEach((window, i) => {
      const hits = this.#hits[i]!;
      if (hits.length < window.limit) return;
      // The oldest call still counting against the limit has to age out first.
      const oldest = hits[hits.length - window.limit]!;
      wait = Math.max(wait, oldest + window.windowMs - now);
    });
    return wait;
  }
}
