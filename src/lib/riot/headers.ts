/**
 * Riot rate-limit response headers → `sync_state.last_rate_limit` (architecture §5.2
 * layer 6). Pure, so the dashboard's headroom display is unit-tested.
 *
 * Riot sends limits and usage as parallel `count:windowSeconds` lists:
 *   X-App-Rate-Limit:       20:1,100:120
 *   X-App-Rate-Limit-Count:  3:1, 47:120
 * A bucket only means something when both headers agree on the window, so the two
 * lists are joined on the window rather than by position.
 */

export type RateLimitBucket = {
  /** Window length in seconds, as Riot labels the bucket. */
  windowS: number;
  limit: number;
  count: number;
};

export type RateLimitSnapshot = {
  app: RateLimitBucket[];
  method: RateLimitBucket[];
  /** Present only on a 429. */
  retryAfterS?: number;
  /** `X-Rate-Limit-Type` on a 429: 'application' | 'method' | 'service'. */
  limitType?: string;
};

/** Minimal shape of a `Headers`, so tests can pass a plain map. */
export type HeaderSource = { get(name: string): string | null };

/**
 * `"20:1,100:120"` → `[[20, 1], [100, 120]]`; malformed pairs are dropped.
 * Both halves must be present: `Number("")` is 0, so an empty half would
 * otherwise pass as a real bucket.
 */
function parsePairs(value: string | null): [number, number][] {
  if (!value) return [];
  return value.split(",").flatMap((entry) => {
    const parts = entry.split(":");
    if (parts.length !== 2) return [];
    const [countRaw, windowRaw] = parts as [string, string];
    if (countRaw.trim() === "" || windowRaw.trim() === "") return [];
    const count = Number(countRaw);
    const windowS = Number(windowRaw);
    return Number.isFinite(count) && Number.isFinite(windowS) && windowS > 0
      ? [[count, windowS] as [number, number]]
      : [];
  });
}

function buckets(limits: string | null, counts: string | null): RateLimitBucket[] {
  const used = new Map(parsePairs(counts).map(([count, windowS]) => [windowS, count]));
  return parsePairs(limits)
    .map(([limit, windowS]) => ({ windowS, limit, count: used.get(windowS) ?? 0 }))
    .sort((a, b) => a.windowS - b.windowS);
}

/**
 * `Retry-After` in seconds. Riot sends a plain integer; a missing or unparseable
 * value falls back to `fallbackS` so a 429 always produces a real cooldown.
 */
export function retryAfterSeconds(headers: HeaderSource, fallbackS = 10): number {
  const raw = Number(headers.get("retry-after"));
  return Number.isFinite(raw) && raw > 0 ? Math.ceil(raw) : fallbackS;
}

export function parseRateLimitHeaders(headers: HeaderSource): RateLimitSnapshot {
  return {
    app: buckets(headers.get("x-app-rate-limit"), headers.get("x-app-rate-limit-count")),
    method: buckets(headers.get("x-method-rate-limit"), headers.get("x-method-rate-limit-count")),
  };
}

/**
 * Smallest fraction of a bucket still unused, across app and method limits.
 * 1 means untouched, 0 means the next call is refused. Undefined when Riot sent
 * no limit headers at all.
 */
export function headroom(snapshot: RateLimitSnapshot): number | undefined {
  const all = [...snapshot.app, ...snapshot.method].filter((bucket) => bucket.limit > 0);
  if (all.length === 0) return undefined;
  return Math.min(...all.map((bucket) => Math.max(0, 1 - bucket.count / bucket.limit)));
}
