import { describe, expect, it } from "vitest";
import { z } from "zod";
import { RiotClient } from "./client";
import { AuthError, BudgetExceeded, NotFoundError, RateLimited, ServerError } from "./errors";
import { getMatchIds, getAccountByRiotId } from "./endpoints";
import { RateLimiter } from "./limiter";
import { accountRegion, matchRegion } from "./routing";

/** A fetch stand-in that replays queued responses and records the requests it saw. */
function mockFetch(responses: (Response | Error)[]) {
  const seen: { url: string; token: string | null }[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    seen.push({
      url: String(input),
      token: new Headers(init?.headers).get("x-riot-token"),
    });
    const next = responses.shift();
    if (!next) throw new Error(`unexpected extra request to ${String(input)}`);
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
  return { impl, seen };
}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });

const makeClient = (responses: (Response | Error)[], budget = 25) => {
  const { impl, seen } = mockFetch(responses);
  const client = new RiotClient({
    apiKey: "RGAPI-test-key",
    platform: "th2",
    budget,
    fetchImpl: impl,
    sleep: async () => {}, // no real waiting
    limiter: new RateLimiter({ windows: [{ limit: 100, windowMs: 1_000 }], concurrency: 3 }),
  });
  return { client, seen };
};

describe("RiotClient success path", () => {
  it("sends the key as a header, never in the URL, and validates the body", async () => {
    const { client, seen } = makeClient([json({ puuid: "p-1", gameName: "A", tagLine: "1" })]);
    const account = await getAccountByRiotId(client, "BurdenInMyHand", "6969");

    expect(account.puuid).toBe("p-1");
    expect(seen[0]!.token).toBe("RGAPI-test-key");
    expect(seen[0]!.url).not.toContain("RGAPI");
    expect(seen[0]!.url).toBe(
      "https://asia.api.riotgames.com/riot/account/v1/accounts/by-riot-id/BurdenInMyHand/6969",
    );
    expect(client.calls).toBe(1);
  });

  it("url-encodes Riot IDs that contain spaces or symbols", async () => {
    const { client, seen } = makeClient([json({ puuid: "p-1" })]);
    await getAccountByRiotId(client, "Name With Space", "t#g");
    expect(seen[0]!.url).toContain("/by-riot-id/Name%20With%20Space/t%23g");
  });

  it("captures rate-limit headers for observability", async () => {
    const { client } = makeClient([
      json(["M1"], {
        headers: {
          "content-type": "application/json",
          "X-App-Rate-Limit": "20:1,100:120",
          "X-App-Rate-Limit-Count": "2:1,9:120",
        },
      }),
    ]);
    await getMatchIds(client, "p-1");
    expect(client.lastRateLimit?.app).toEqual([
      { windowS: 1, limit: 20, count: 2 },
      { windowS: 120, limit: 100, count: 9 },
    ]);
  });

  it("reports a changed response shape readably", async () => {
    const { client } = makeClient([json({ nope: true })]);
    await expect(client.get("https://x.api.riotgames.com/y", z.array(z.string()), "match ids")).rejects.toThrow(
      /Unexpected Riot response \(match ids\)/,
    );
  });
});

describe("RiotClient 429 handling", () => {
  const rateLimited = (retryAfter: string, type = "application") =>
    new Response("", { status: 429, headers: { "Retry-After": retryAfter, "X-Rate-Limit-Type": type } });

  it("absorbs a short Retry-After with one inline retry", async () => {
    const { client, seen } = makeClient([rateLimited("2"), json(["M1"])]);
    await expect(getMatchIds(client, "p-1")).resolves.toEqual(["M1"]);
    expect(seen).toHaveLength(2);
    expect(client.calls).toBe(2); // the refused call still counts against the budget
  });

  it("gives up on a long Retry-After, carrying the wait to the caller", async () => {
    const { client, seen } = makeClient([rateLimited("30", "method")]);
    const error = await getMatchIds(client, "p-1").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RateLimited);
    expect((error as RateLimited).retryAfterS).toBe(30);
    expect((error as RateLimited).limitType).toBe("method");
    expect(seen).toHaveLength(1); // no retry storm
    expect(client.lastRateLimit?.retryAfterS).toBe(30);
  });

  it("retries a short 429 only once, then surfaces it", async () => {
    const { client, seen } = makeClient([rateLimited("1"), rateLimited("1")]);
    await expect(getMatchIds(client, "p-1")).rejects.toBeInstanceOf(RateLimited);
    expect(seen).toHaveLength(2);
  });

  it("defaults the cooldown when Riot omits Retry-After", async () => {
    const { client } = makeClient([new Response("", { status: 429 })]);
    const error = await getMatchIds(client, "p-1").catch((e: unknown) => e);
    expect((error as RateLimited).retryAfterS).toBe(10);
  });
});

describe("RiotClient error mapping", () => {
  it("maps 401 and 403 to an auth error, without retrying", async () => {
    for (const status of [401, 403]) {
      const { client, seen } = makeClient([new Response("", { status })]);
      const error = await getMatchIds(client, "p-1").catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AuthError);
      expect((error as AuthError).message).toBe("Riot key invalid/expired");
      expect(seen).toHaveLength(1);
    }
  });

  it("maps 404 to not-found, without retrying", async () => {
    const { client, seen } = makeClient([new Response("", { status: 404 })]);
    await expect(getMatchIds(client, "p-1")).rejects.toBeInstanceOf(NotFoundError);
    expect(seen).toHaveLength(1);
  });

  it("retries a 5xx once, then fails", async () => {
    const ok = makeClient([new Response("", { status: 503 }), json(["M1"])]);
    await expect(getMatchIds(ok.client, "p-1")).resolves.toEqual(["M1"]);

    const bad = makeClient([new Response("", { status: 500 }), new Response("", { status: 500 })]);
    await expect(getMatchIds(bad.client, "p-1")).rejects.toBeInstanceOf(ServerError);
    expect(bad.seen).toHaveLength(2);
  });

  it("retries a network failure once", async () => {
    const { client, seen } = makeClient([new Error("ECONNRESET"), json(["M1"])]);
    await expect(getMatchIds(client, "p-1")).resolves.toEqual(["M1"]);
    expect(seen).toHaveLength(2);
  });
});

describe("RiotClient call budget", () => {
  it("refuses to exceed the per-run cap", async () => {
    const { client, seen } = makeClient([json(["A"]), json(["B"]), json(["C"])], 2);
    await getMatchIds(client, "p-1");
    await getMatchIds(client, "p-1");
    await expect(getMatchIds(client, "p-1")).rejects.toBeInstanceOf(BudgetExceeded);

    expect(seen).toHaveLength(2); // the third never reached the network
    expect(client.remainingBudget).toBe(0);
  });

  it("does not burn its last call on a retry it cannot afford", async () => {
    const { client, seen } = makeClient([new Response("", { status: 500 })], 1);
    await expect(getMatchIds(client, "p-1")).rejects.toBeInstanceOf(ServerError);
    expect(seen).toHaveLength(1);
  });
});

describe("routing", () => {
  it("sends th2 match traffic to sea and account traffic to asia", () => {
    // account-v1 has no SEA host (§5.1); riot-setup verifies this against the live API.
    expect(matchRegion("th2")).toBe("sea");
    expect(accountRegion("th2")).toBe("asia");
  });

  it("maps the other shards per architecture §5.1", () => {
    expect([matchRegion("na1"), matchRegion("euw1"), matchRegion("kr"), matchRegion("oc1")]).toEqual([
      "americas",
      "europe",
      "asia",
      "sea",
    ]);
    expect([accountRegion("br1"), accountRegion("ru"), accountRegion("jp1"), accountRegion("vn2")]).toEqual([
      "americas",
      "europe",
      "asia",
      "asia",
    ]);
  });
});
