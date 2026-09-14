import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RiotClient } from "@/lib/riot/client";
import { RateLimiter } from "@/lib/riot/limiter";
import { AUTH_ERROR_COOLDOWN_S, COOLDOWN_S, isStale, syncPlayer, type SyncState } from "./sync-service";

/**
 * The sync algorithm (architecture §5.3) against a fake Supabase and a mocked Riot,
 * so the roadmap's four "done when" gates are checked deterministically. The live
 * run confirms the same behaviour against the real API.
 */

const rawMatch: unknown = JSON.parse(readFileSync("src/lib/sync/__fixtures__/match.json", "utf8"));
const ME = "PUUID_ME";

type Write = { table: string; op: "upsert" | "insert" | "update"; rows: unknown };

type DbConfig = {
  /** Rows acquire_sync_lock returns; empty means "locked or cooling". */
  lock?: unknown[];
  syncState?: Partial<SyncState>;
  storedMatchIds?: string[];
  rankLatest?: { tier: string | null; division: string | null; lp: number | null }[];
};

/** Minimal stand-in for the supabase-js query builder: chainable and awaitable. */
function makeDb(config: DbConfig = {}) {
  const writes: Write[] = [];
  const stored = new Set(config.storedMatchIds ?? []);

  const dataFor = (table: string): unknown => {
    switch (table) {
      case "matches":
        return [...stored].map((match_id) => ({ match_id }));
      case "champions":
        return [
          { api_name: "DA_18_Sivir", cost: 4 },
          { api_name: "DA_Sentinel18", cost: 4 },
        ];
      case "traits":
        return [{ api_name: "DA_18_Hunter", breakpoints: [{ min: 2, style: "bronze" }, { min: 3, style: "silver" }] }];
      case "sync_state":
        return [{ next_allowed_at: null, ...config.syncState }];
      case "rank_snapshots":
        return config.rankLatest ?? [];
      case "riot_accounts":
        return [{ puuid: ME }];
      default:
        return [];
    }
  };

  const from = (table: string) => {
    const record = (op: Write["op"]) => (rows: unknown) => {
      writes.push({ table, op, rows });
      return builder;
    };
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      lt: () => builder,
      order: () => builder,
      limit: () => builder,
      range: () => builder,
      upsert: record("upsert"),
      insert: record("insert"),
      update: record("update"),
      then: (resolve: (value: { data: unknown; error: null }) => unknown) =>
        Promise.resolve(resolve({ data: dataFor(table), error: null })),
    };
    return builder;
  };

  const db = {
    from,
    rpc: () => Promise.resolve({ data: config.lock ?? [{ puuid: ME }], error: null }),
  };
  // The fake only implements what syncPlayer touches.
  return { db: db as never, writes };
}

/** A Riot client whose responses are queued in order. */
function makeClient(responses: Response[], budget = 25) {
  const seen: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    seen.push(String(input));
    const next = responses.shift();
    if (!next) throw new Error(`unexpected request to ${String(input)}`);
    return next;
  }) as unknown as typeof fetch;

  const client = new RiotClient({
    apiKey: "k",
    platform: "sg2",
    budget,
    fetchImpl,
    sleep: async () => {},
    limiter: new RateLimiter({ windows: [{ limit: 100, windowMs: 1_000 }], concurrency: 3 }),
  });
  return { client, seen };
}

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

const LEAGUE = [{ queueType: "RANKED_TFT", tier: "GOLD", rank: "II", leaguePoints: 75, wins: 21, losses: 18 }];
const MATCH_ID = "SG2_173695822";

const statusOf = (writes: Write[]) =>
  (writes.filter((w) => w.table === "sync_state").at(-1)?.rows as { status?: string } | undefined)?.status;

describe("the sync gate", () => {
  it("is skipped when the lock is held or the cooldown is active", async () => {
    const { db, writes } = makeDb({ lock: [], syncState: { next_allowed_at: "2030-01-01T00:00:00Z" } });
    const { client, seen } = makeClient([]);

    const result = await syncPlayer(ME, "manual", { db, client });

    expect(result).toEqual({
      status: "skipped",
      reason: "locked-or-cooling",
      nextAllowedAt: "2030-01-01T00:00:00Z",
    });
    expect(seen).toHaveLength(0); // Riot is never called
    expect(writes).toHaveLength(0);
  });
});

describe("a steady-state sync", () => {
  it("uses exactly 2 calls when there are no new matches", async () => {
    const { db, writes } = makeDb({ storedMatchIds: [MATCH_ID] });
    const { client, seen } = makeClient([json([MATCH_ID]), json(LEAGUE)]);

    const result = await syncPlayer(ME, "manual", { db, client });

    // toMatchObject, not toEqual: the result also carries `nextAllowedAt`, a
    // timestamp this test has no reason to pin.
    expect(result).toMatchObject({ status: "ok", newMatches: 0, calls: 2 });
    expect(seen).toHaveLength(2); // ids + league, no match details
    expect(seen.some((url) => url.includes(`/matches/${MATCH_ID}`))).toBe(false);
    expect(statusOf(writes)).toBe("ok");
  });

  it("fetches only the ids it hasn't cached and commits each match", async () => {
    const { db, writes } = makeDb({ storedMatchIds: [] });
    const { client, seen } = makeClient([json([MATCH_ID]), json(rawMatch), json(LEAGUE)]);

    const result = await syncPlayer(ME, "manual", { db, client });

    expect(result).toMatchObject({ status: "ok", newMatches: 1, calls: 3 });
    expect(seen[1]).toContain(`/tft/match/v1/matches/${MATCH_ID}`);
    expect(writes.filter((w) => w.table === "matches" && w.op === "upsert")).toHaveLength(1);
    expect(writes.filter((w) => w.table === "player_matches" && w.op === "upsert")).toHaveLength(1);
  });

  it("sets a cooldown and records the call count on success", async () => {
    const { db, writes } = makeDb({ storedMatchIds: [MATCH_ID] });
    const { client } = makeClient([json([MATCH_ID]), json(LEAGUE)]);

    await syncPlayer(ME, "manual", { db, client });

    const final = writes.filter((w) => w.table === "sync_state").at(-1)?.rows as Record<string, unknown>;
    expect(final.status).toBe("ok");
    expect(final.lock_until).toBeNull();
    expect(final.last_call_count).toBe(2);
    expect(Date.parse(final.next_allowed_at as string)).toBeGreaterThan(Date.now() + 100_000);
  });

  it("refreshes the profile only on the cron trigger", async () => {
    const manual = makeDb({ storedMatchIds: [MATCH_ID] });
    await syncPlayer(ME, "manual", { db: manual.db, client: makeClient([json([MATCH_ID]), json(LEAGUE)]).client });
    expect(manual.writes.some((w) => w.table === "riot_accounts")).toBe(false);

    const cron = makeDb({ storedMatchIds: [MATCH_ID] });
    const { client, seen } = makeClient([json([MATCH_ID]), json(LEAGUE), json({ puuid: ME, summonerLevel: 410 })]);
    await syncPlayer(ME, "cron", { db: cron.db, client });
    expect(seen.some((url) => url.includes("/tft/summoner/v1/"))).toBe(true);
    expect(cron.writes.some((w) => w.table === "riot_accounts" && w.op === "update")).toBe(true);
  });
});

describe("rank snapshots", () => {
  it("appends only when the rank actually moved", async () => {
    const unchanged = makeDb({
      storedMatchIds: [MATCH_ID],
      rankLatest: [{ tier: "GOLD", division: "II", lp: 75 }],
    });
    await syncPlayer(ME, "manual", { db: unchanged.db, client: makeClient([json([MATCH_ID]), json(LEAGUE)]).client });
    expect(unchanged.writes.some((w) => w.table === "rank_snapshots" && w.op === "insert")).toBe(false);

    const moved = makeDb({
      storedMatchIds: [MATCH_ID],
      rankLatest: [{ tier: "GOLD", division: "II", lp: 52 }],
    });
    await syncPlayer(ME, "manual", { db: moved.db, client: makeClient([json([MATCH_ID]), json(LEAGUE)]).client });
    expect(moved.writes.some((w) => w.table === "rank_snapshots" && w.op === "insert")).toBe(true);
  });
});

describe("failure paths keep partial progress", () => {
  it("a 429 mid-run leaves status rate_limited with the matches already stored", async () => {
    const { db, writes } = makeDb({ storedMatchIds: [] });
    const { client } = makeClient([
      json(["M_A", "M_B"]),
      json(rawMatch), // M_A lands
      new Response("", { status: 429, headers: { "Retry-After": "30" } }), // M_B is refused
    ]);

    const result = await syncPlayer(ME, "manual", { db, client });

    expect(result).toMatchObject({ status: "rate_limited", retryAfterS: 30, newMatches: 1 });
    // The first match survived the failed run.
    expect(writes.filter((w) => w.table === "matches" && w.op === "upsert")).toHaveLength(1);

    const final = writes.filter((w) => w.table === "sync_state").at(-1)?.rows as Record<string, unknown>;
    expect(final.status).toBe("rate_limited");
    expect(final.lock_until).toBeNull(); // the lock is always released
    expect(Date.parse(final.next_allowed_at as string)).toBeGreaterThan(Date.now() + 25_000);
  });

  it("an expired key reports the error without throwing, so the page still renders", async () => {
    const { db, writes } = makeDb({ storedMatchIds: [] });
    const { client } = makeClient([new Response("", { status: 403 })]);

    const result = await syncPlayer(ME, "manual", { db, client });

    expect(result).toMatchObject({ status: "error", message: "Riot key invalid/expired" });
    const final = writes.filter((w) => w.table === "sync_state").at(-1)?.rows as Record<string, unknown>;
    expect(final.status).toBe("error");
    expect(final.lock_until).toBeNull();
  });

  it("a manual retry after an expired key keeps the short cooldown, not the day-long one", async () => {
    const { db, writes } = makeDb({ storedMatchIds: [] });
    const { client } = makeClient([new Response("", { status: 403 })]);
    const before = Date.now();

    const result = await syncPlayer(ME, "manual", { db, client });

    expect(result.status).toBe("error");
    const nextAllowedAt = Date.parse(result.status === "error" ? result.nextAllowedAt : "");
    // A person just rotated the key and reached for `pnpm riot:sync` or the
    // refresh button — that shouldn't be locked out for a day by the failure
    // that prompted the fix.
    expect(nextAllowedAt).toBeLessThanOrEqual(before + COOLDOWN_S * 1000 + 1_000);
    const final = writes.filter((w) => w.table === "sync_state").at(-1)?.rows as Record<string, unknown>;
    expect(Date.parse(final.next_allowed_at as string)).toBeLessThanOrEqual(before + COOLDOWN_S * 1000 + 1_000);
  });

  it.each(["cron", "stale-read"] as const)(
    "an expired key on an unattended %s trigger gets the day-long cooldown, not COOLDOWN_S",
    async (trigger) => {
      const { db, writes } = makeDb({ storedMatchIds: [] });
      const { client } = makeClient([new Response("", { status: 403 })]);
      const before = Date.now();

      const result = await syncPlayer(ME, trigger, { db, client });

      expect(result.status).toBe("error");
      const nextAllowedAt = Date.parse(result.status === "error" ? result.nextAllowedAt : "");
      // Otherwise a dead key gets retried, and fails, on essentially every
      // stale `/me` visit or cron tick until someone notices and fixes it.
      expect(nextAllowedAt).toBeGreaterThan(before + COOLDOWN_S * 1000);
      expect(nextAllowedAt).toBeLessThanOrEqual(before + AUTH_ERROR_COOLDOWN_S * 1000 + 1_000);
      const final = writes.filter((w) => w.table === "sync_state").at(-1)?.rows as Record<string, unknown>;
      expect(Date.parse(final.next_allowed_at as string)).toBeGreaterThan(before + COOLDOWN_S * 1000);
    },
  );

  it("a rate limit still uses Riot's own Retry-After, not the auth cooldown", async () => {
    const { db } = makeDb({ storedMatchIds: [] });
    const { client } = makeClient([new Response("", { status: 429, headers: { "Retry-After": "5" } })]);

    const result = await syncPlayer(ME, "cron", { db, client });

    expect(result).toMatchObject({ status: "rate_limited", retryAfterS: 5 });
    const nextAllowedAt = Date.parse(result.status === "rate_limited" ? result.nextAllowedAt : "");
    expect(nextAllowedAt).toBeLessThan(Date.now() + COOLDOWN_S * 1000);
  });

  it("never exceeds the per-run call budget", async () => {
    const ids = Array.from({ length: 20 }, (_, i) => `M_${i}`);
    const { db } = makeDb({ storedMatchIds: [] });
    // ids + 20 details + league = 22, inside the cap of 25.
    const { client, seen } = makeClient([json(ids), ...ids.map(() => json(rawMatch)), json(LEAGUE)]);

    const result = await syncPlayer(ME, "manual", { db, client });

    expect(result).toMatchObject({ status: "ok", newMatches: 20 });
    expect(result.status === "ok" && result.calls).toBeLessThanOrEqual(25);
    expect(seen).toHaveLength(22);
  });
});

describe("isStale", () => {
  const state = (over: Partial<SyncState>): SyncState =>
    ({
      puuid: ME, status: "ok", lock_until: null, next_allowed_at: null, last_started_at: null,
      last_success_at: null, last_error: null, last_call_count: null, last_rate_limit: null,
      ...over,
    }) as SyncState;
  const now = Date.parse("2026-09-12T12:00:00Z");
  const minutesAgo = (n: number) => new Date(now - n * 60_000).toISOString();
  const minutesAhead = (n: number) => new Date(now + n * 60_000).toISOString();

  it("is stale when the last success is over ten minutes old", () => {
    expect(isStale(state({ last_success_at: minutesAgo(11) }), now)).toBe(true);
    expect(isStale(state({ last_success_at: minutesAgo(9) }), now)).toBe(false);
  });

  it("is stale when the account has never synced", () => {
    expect(isStale(state({ last_success_at: null }), now)).toBe(true);
  });

  it("defers to the cooldown and to a running sync", () => {
    expect(isStale(state({ last_success_at: minutesAgo(30), next_allowed_at: minutesAhead(1) }), now)).toBe(false);
    expect(isStale(state({ last_success_at: minutesAgo(30), lock_until: minutesAhead(1) }), now)).toBe(false);
    // Expired lock and cooldown don't block it.
    expect(isStale(state({ last_success_at: minutesAgo(30), lock_until: minutesAgo(1) }), now)).toBe(true);
  });

  it("does nothing without a sync_state row", () => {
    expect(isStale(undefined, now)).toBe(false);
  });
});

describe("every sync result carries a cooldown", () => {
  it("tells the caller when the next sync is allowed, so the UI needn't wait for a re-render", async () => {
    const { db } = makeDb({ storedMatchIds: [MATCH_ID] });
    const before = Date.now();
    const result = await syncPlayer(ME, "manual", {
      db,
      client: makeClient([json([MATCH_ID]), json(LEAGUE)]).client,
    });

    // The refresh button seeds its countdown from this rather than from a prop,
    // which is what makes a "you're up to date" refresh start the cooldown.
    expect(result.status).toBe("ok");
    const nextAllowedAt = Date.parse(result.status === "ok" ? result.nextAllowedAt : "");
    expect(nextAllowedAt).toBeGreaterThanOrEqual(before);
    expect(nextAllowedAt).toBeLessThanOrEqual(Date.now() + 121_000);
  });
});
