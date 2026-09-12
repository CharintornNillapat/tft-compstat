import { describe, expect, it } from "vitest";
import { RateLimiter } from "./limiter";

/**
 * A virtual clock: `sleep` jumps time forward instead of waiting, so the windows
 * are exercised exactly without the tests taking seconds.
 */
function fakeClock(start = 1_000_000) {
  let now = start;
  return {
    now: () => now,
    sleep: async (ms: number) => {
      now += ms;
    },
    advance: (ms: number) => {
      now += ms;
    },
    get time() {
      return now;
    },
  };
}

/** Records the clock reading at which each call ran. */
function tracker(limiter: RateLimiter, clock: { now: () => number }) {
  const at: number[] = [];
  return {
    at,
    call: () =>
      limiter.run(async () => {
        at.push(clock.now());
      }),
  };
}

describe("RateLimiter windows", () => {
  it("admits calls up to the limit without waiting, then spaces the rest by the window", async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({
      windows: [{ limit: 3, windowMs: 1_000 }],
      concurrency: 1,
      now: clock.now,
      sleep: clock.sleep,
    });
    const { at, call } = tracker(limiter, clock);
    const start = clock.time;

    for (let i = 0; i < 7; i++) await call();

    // 3 immediately, then one window per batch of 3.
    expect(at.map((t) => t - start)).toEqual([0, 0, 0, 1_000, 1_000, 1_000, 2_000]);
  });

  it("slides rather than resetting: a call ages out one slot at a time", async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({
      windows: [{ limit: 2, windowMs: 1_000 }],
      concurrency: 1,
      now: clock.now,
      sleep: clock.sleep,
    });
    const { at, call } = tracker(limiter, clock);
    const start = clock.time;

    await call(); // t+0
    clock.advance(400);
    await call(); // t+400 — window now full
    await call(); // must wait for the t+0 call to expire, so t+1000
    await call(); // then for the t+400 call, so t+1400

    expect(at.map((t) => t - start)).toEqual([0, 400, 1_000, 1_400]);
  });

  it("respects every window at once", async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({
      windows: [
        { limit: 2, windowMs: 1_000 },
        { limit: 3, windowMs: 10_000 },
      ],
      concurrency: 1,
      now: clock.now,
      sleep: clock.sleep,
    });
    const { at, call } = tracker(limiter, clock);
    const start = clock.time;

    for (let i = 0; i < 4; i++) await call();

    // The first three fit the short window's pacing; the fourth waits on the long one.
    expect(at.map((t) => t - start)).toEqual([0, 0, 1_000, 10_000]);
  });

  it("defaults to budgets below Riot's 20/1s and 100/120s", async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({ concurrency: 1, now: clock.now, sleep: clock.sleep });
    const { at, call } = tracker(limiter, clock);
    const start = clock.time;

    for (let i = 0; i < 16; i++) await call();

    expect(at.filter((t) => t === start)).toHaveLength(15); // 15/1s, not 20
    expect(at[15]! - start).toBe(1_000);
  });
});

describe("RateLimiter concurrency", () => {
  it("never runs more than `concurrency` calls at once", async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({
      windows: [{ limit: 100, windowMs: 1_000 }], // wide enough that only concurrency binds
      concurrency: 3,
      now: clock.now,
      sleep: clock.sleep,
    });
    // Lets every pending microtask settle before the next assertion.
    const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

    let inFlight = 0;
    let peak = 0;
    let finished = 0;
    const release: (() => void)[] = [];
    const calls = Array.from({ length: 8 }, () =>
      limiter.run(async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise<void>((resolve) => release.push(resolve));
        inFlight--;
        finished++;
      }),
    );

    await flush();
    expect(release).toHaveLength(3); // the other five are still queued
    expect(peak).toBe(3);

    // Finish them one at a time; each completion admits exactly one more.
    while (release.length > 0) {
      release.shift()!();
      await flush();
    }
    await Promise.all(calls);
    expect(finished).toBe(8);
    expect(peak).toBe(3);
  });

  it("frees its slot when a call throws", async () => {
    const limiter = new RateLimiter({ windows: [{ limit: 10, windowMs: 1_000 }], concurrency: 1 });
    await expect(limiter.run(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    await expect(limiter.run(async () => "ok")).resolves.toBe("ok");
  });
});

describe("RateLimiter pauseFor", () => {
  it("holds later calls for a 429's Retry-After", async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({
      windows: [{ limit: 100, windowMs: 1_000 }],
      concurrency: 1,
      now: clock.now,
      sleep: clock.sleep,
    });
    const { at, call } = tracker(limiter, clock);
    const start = clock.time;

    await call();
    limiter.pauseFor(5_000);
    await call();

    expect(at.map((t) => t - start)).toEqual([0, 5_000]);
  });

  it("reports recent calls in the shortest window", async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({
      windows: [{ limit: 100, windowMs: 1_000 }],
      concurrency: 1,
      now: clock.now,
      sleep: clock.sleep,
    });
    await limiter.run(async () => {});
    await limiter.run(async () => {});
    expect(limiter.recentCalls).toBe(2);
    clock.advance(1_001);
    expect(limiter.recentCalls).toBe(0);
  });
});
