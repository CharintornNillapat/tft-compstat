import { describe, expect, it, vi } from "vitest";
import { backoffDelayMs, createRetryingFetch } from "./retry";

const response = (status: number) => new Response(null, { status });

/** A `sleep` that resolves immediately but records what it was asked to wait. */
function fakeSleep() {
  const waits: number[] = [];
  return { waits, sleep: async (ms: number) => void waits.push(ms) };
}

describe("backoffDelayMs", () => {
  it("doubles the range each attempt, scaled by the injected random draw", () => {
    expect(backoffDelayMs(0, 300, () => 0.5)).toBe(150);
    expect(backoffDelayMs(1, 300, () => 0.5)).toBe(300);
    expect(backoffDelayMs(2, 300, () => 0.5)).toBe(600);
  });

  it("stays in [0, baseMs * 2^attempt)", () => {
    expect(backoffDelayMs(3, 300, () => 0)).toBe(0);
    expect(backoffDelayMs(3, 300, () => 1)).toBe(2400);
  });
});

describe("createRetryingFetch", () => {
  it("returns the first response without sleeping when nothing is retriable", async () => {
    const { waits, sleep } = fakeSleep();
    const fetchImpl = vi.fn().mockResolvedValue(response(200));
    const retryingFetch = createRetryingFetch({ fetch: fetchImpl, sleep, random: () => 0 });

    const result = await retryingFetch("https://example.test");

    expect(result.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(waits).toEqual([]);
  });

  it("retries a 503 with backoff, then returns the eventual success", async () => {
    const { waits, sleep } = fakeSleep();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(503))
      .mockResolvedValueOnce(response(200));
    const retryingFetch = createRetryingFetch({ fetch: fetchImpl, sleep, random: () => 0.5, baseMs: 100 });

    const result = await retryingFetch("https://example.test");

    expect(result.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(waits).toEqual([50]); // backoffDelayMs(0, 100, 0.5)
  });

  it("retries a thrown network error the same way as a retriable status", async () => {
    const { sleep } = fakeSleep();
    const fetchImpl = vi.fn().mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValueOnce(response(200));
    const retryingFetch = createRetryingFetch({ fetch: fetchImpl, sleep, random: () => 0 });

    await expect(retryingFetch("https://example.test")).resolves.toMatchObject({ status: 200 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("gives up after the configured attempts and returns the last bad response", async () => {
    const { sleep } = fakeSleep();
    const fetchImpl = vi.fn().mockResolvedValue(response(504));
    const retryingFetch = createRetryingFetch({ fetch: fetchImpl, sleep, random: () => 0, attempts: 3 });

    const result = await retryingFetch("https://example.test");

    expect(result.status).toBe(504);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("gives up after the configured attempts and rethrows the last network error", async () => {
    const { sleep } = fakeSleep();
    const error = new TypeError("fetch failed");
    const fetchImpl = vi.fn().mockRejectedValue(error);
    const retryingFetch = createRetryingFetch({ fetch: fetchImpl, sleep, random: () => 0, attempts: 2 });

    await expect(retryingFetch("https://example.test")).rejects.toThrow(error);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not retry a real PostgREST/RLS error (4xx)", async () => {
    const { waits, sleep } = fakeSleep();
    const fetchImpl = vi.fn().mockResolvedValue(response(400));
    const retryingFetch = createRetryingFetch({ fetch: fetchImpl, sleep, random: () => 0 });

    const result = await retryingFetch("https://example.test");

    expect(result.status).toBe(400);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(waits).toEqual([]);
  });

  it("never delays before the first attempt, only between retries", async () => {
    const { waits, sleep } = fakeSleep();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(500))
      .mockResolvedValueOnce(response(500))
      .mockResolvedValueOnce(response(200));
    const retryingFetch = createRetryingFetch({ fetch: fetchImpl, sleep, random: () => 1, baseMs: 10, attempts: 3 });

    await retryingFetch("https://example.test");

    expect(waits).toHaveLength(2); // one sleep between each of the 3 attempts
  });
});
