import { describe, expect, it } from "vitest";
import { formatAge, metaFreshness, STALE_AFTER_MS } from "./meta-freshness";

const NOW = Date.parse("2026-09-16T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("formatAge", () => {
  it("counts minutes under an hour, hours under two days, then days", () => {
    expect(formatAge(40 * 60_000)).toBe("40m");
    expect(formatAge(6 * 3_600_000)).toBe("6h");
    expect(formatAge(47 * 3_600_000)).toBe("47h");
    expect(formatAge(72 * 3_600_000)).toBe("3d");
  });
});

describe("metaFreshness", () => {
  it("is fresh inside 24h", () => {
    expect(metaFreshness(ago(6 * 3_600_000), NOW)).toEqual({ state: "fresh", age: "6h" });
  });

  it("is stale at exactly 24h and beyond", () => {
    expect(metaFreshness(ago(STALE_AFTER_MS), NOW).state).toBe("stale");
    expect(metaFreshness(ago(3 * STALE_AFTER_MS), NOW)).toEqual({ state: "stale", age: "3d" });
  });

  it("is unknown rather than fresh when nothing has been seeded", () => {
    expect(metaFreshness(null, NOW)).toEqual({ state: "unknown", age: null });
  });

  it("is unknown rather than fresh for an unparseable timestamp", () => {
    expect(metaFreshness("not a date", NOW)).toEqual({ state: "unknown", age: null });
  });

  it("treats a future timestamp as brand new, not as a negative age", () => {
    expect(metaFreshness(ago(-3_600_000), NOW)).toEqual({ state: "fresh", age: "0m" });
  });
});
