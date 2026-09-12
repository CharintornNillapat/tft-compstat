import { describe, expect, it } from "vitest";
import { headroom, parseRateLimitHeaders, retryAfterSeconds } from "./headers";

const headers = (map: Record<string, string>) => new Headers(map);

describe("parseRateLimitHeaders", () => {
  it("joins limits and counts on the window, not on position", () => {
    // Riot may order the two lists differently; 120 must still pair with 120.
    const snapshot = parseRateLimitHeaders(
      headers({
        "X-App-Rate-Limit": "20:1,100:120",
        "X-App-Rate-Limit-Count": "47:120,3:1",
        "X-Method-Rate-Limit": "200:10",
        "X-Method-Rate-Limit-Count": "12:10",
      }),
    );
    expect(snapshot.app).toEqual([
      { windowS: 1, limit: 20, count: 3 },
      { windowS: 120, limit: 100, count: 47 },
    ]);
    expect(snapshot.method).toEqual([{ windowS: 10, limit: 200, count: 12 }]);
  });

  it("treats a limit with no matching count as unused, and copes with missing headers", () => {
    expect(parseRateLimitHeaders(headers({ "X-App-Rate-Limit": "20:1" })).app).toEqual([
      { windowS: 1, limit: 20, count: 0 },
    ]);
    expect(parseRateLimitHeaders(headers({}))).toEqual({ app: [], method: [] });
  });

  it("drops malformed pairs instead of producing NaN buckets", () => {
    const snapshot = parseRateLimitHeaders(
      headers({ "X-App-Rate-Limit": "20:1,garbage,:5,100:120", "X-App-Rate-Limit-Count": "3:1" }),
    );
    expect(snapshot.app).toEqual([
      { windowS: 1, limit: 20, count: 3 },
      { windowS: 120, limit: 100, count: 0 },
    ]);
  });
});

describe("retryAfterSeconds", () => {
  it("reads Retry-After and rounds part-seconds up", () => {
    expect(retryAfterSeconds(headers({ "Retry-After": "7" }))).toBe(7);
    expect(retryAfterSeconds(headers({ "Retry-After": "1.2" }))).toBe(2);
  });

  it("falls back when the header is missing or unusable, so a 429 always sets a cooldown", () => {
    expect(retryAfterSeconds(headers({}))).toBe(10);
    expect(retryAfterSeconds(headers({ "Retry-After": "soon" }))).toBe(10);
    expect(retryAfterSeconds(headers({ "Retry-After": "0" }))).toBe(10);
    expect(retryAfterSeconds(headers({}), 42)).toBe(42);
  });
});

describe("headroom", () => {
  it("reports the tightest bucket across app and method limits", () => {
    expect(headroom({ app: [{ windowS: 1, limit: 20, count: 5 }], method: [] })).toBeCloseTo(0.75);
    expect(
      headroom({
        app: [{ windowS: 120, limit: 100, count: 10 }],
        method: [{ windowS: 10, limit: 200, count: 180 }],
      }),
    ).toBeCloseTo(0.1);
  });

  it("is 0 when a bucket is spent and undefined when Riot sent no limits", () => {
    expect(headroom({ app: [{ windowS: 1, limit: 20, count: 25 }], method: [] })).toBe(0);
    expect(headroom({ app: [], method: [] })).toBeUndefined();
  });
});
