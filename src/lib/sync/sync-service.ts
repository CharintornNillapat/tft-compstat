import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { riotEnv } from "@/lib/env";
import { RiotClient } from "@/lib/riot/client";
import { AuthError, RateLimited } from "@/lib/riot/errors";
import {
  getLeagueEntries,
  getMatchIds,
  getMatchRaw,
  getSummoner,
  MATCH_PAGE_SIZE,
  RANKED_TFT,
} from "@/lib/riot/endpoints";
import { matchSchema } from "@/lib/riot/schemas";
import type { TraitBreakpoint } from "@/lib/static/game";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { must } from "@/lib/supabase/result";
import type { Database } from "@/lib/supabase/types";
import { deriveMatch, derivePlayerMatch, type StaticLookup } from "./derive";

/**
 * The only path from the app to Riot (architecture §5.3). Every trigger — cron, the
 * refresh action, stale-on-read — goes through `acquire_sync_lock`, so at most one
 * sync runs at a time across all Vercel instances and the call rate stays bounded.
 */

type Db = SupabaseClient<Database>;

/** Cooldown after a successful run (§5.2 layer 3). */
export const COOLDOWN_S = 120;
/** How long a crashed instance can hold the lock before it expires on its own. */
export const LOCK_S = 90;
/** `/me` schedules a background sync when the last success is older than this. */
export const STALE_AFTER_MS = 10 * 60 * 1000;

export type SyncTrigger = "cron" | "manual" | "stale-read";

export type SyncResult =
  | { status: "skipped"; reason: "locked-or-cooling"; nextAllowedAt: string | null }
  | { status: "ok"; newMatches: number; calls: number }
  | { status: "rate_limited"; retryAfterS: number; newMatches: number; calls: number }
  | { status: "error"; message: string; newMatches: number; calls: number };

/** Static reference data, read once per sync so derivation stays pure. */
export async function loadStaticLookup(db: Db): Promise<StaticLookup> {
  const [champions, traits] = await Promise.all([
    db.from("champions").select("api_name,cost"),
    db.from("traits").select("api_name,breakpoints"),
  ]);
  const costs = new Map(must(champions, "champions").map((row) => [row.api_name, row.cost]));
  const breakpoints = new Map(
    must(traits, "traits").map((row) => [row.api_name, row.breakpoints as unknown as TraitBreakpoint[]]),
  );
  return {
    championCost: (apiName) => costs.get(apiName),
    traitBreakpoints: (apiName) => breakpoints.get(apiName),
  };
}

/** Which of `ids` we haven't already stored. Match details are immutable (§5.2 layer 1). */
async function missingMatchIds(db: Db, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const stored = must(await db.from("matches").select("match_id").in("match_id", ids), "matches");
  const known = new Set(stored.map((row) => row.match_id));
  return ids.filter((id) => !known.has(id));
}

/**
 * Appends a rank snapshot only when the rank actually moved, so the table stays an
 * LP history rather than one row per sync.
 */
async function recordRank(db: Db, puuid: string, entry: { tier?: string | null; rank?: string | null; leaguePoints?: number | null; wins?: number | null; losses?: number | null }) {
  const latest = must(
    await db
      .from("rank_snapshots")
      .select("tier,division,lp")
      .eq("puuid", puuid)
      .eq("queue_type", RANKED_TFT)
      .order("captured_at", { ascending: false })
      .limit(1),
    "rank_snapshots",
  )[0];

  const next = { tier: entry.tier ?? null, division: entry.rank ?? null, lp: entry.leaguePoints ?? null };
  if (latest && latest.tier === next.tier && latest.division === next.division && latest.lp === next.lp) return;

  must(
    await db.from("rank_snapshots").insert({
      puuid,
      queue_type: RANKED_TFT,
      ...next,
      wins: entry.wins ?? null,
      losses: entry.losses ?? null,
    }),
    "rank_snapshots",
  );
}

export type SyncOptions = {
  db?: Db;
  client?: RiotClient;
  /** Matches to request ids for; the budget caps how many details are fetched. */
  count?: number;
};

/**
 * Syncs one account. Never throws for an expected failure: the outcome is in the
 * return value and in `sync_state`, so a cron or a page render can't be broken by Riot.
 */
export async function syncPlayer(
  puuid: string,
  trigger: SyncTrigger,
  options: SyncOptions = {},
): Promise<SyncResult> {
  const db = options.db ?? getSupabaseAdmin();

  // The gate: one row means we hold the lock, zero means another run has it or we're cooling.
  const locked = must(await db.rpc("acquire_sync_lock", { p_puuid: puuid, p_lock_s: LOCK_S }), "acquire_sync_lock");
  if (locked.length === 0) {
    const state = must(
      await db.from("sync_state").select("next_allowed_at").eq("puuid", puuid).limit(1),
      "sync_state",
    )[0];
    return { status: "skipped", reason: "locked-or-cooling", nextAllowedAt: state?.next_allowed_at ?? null };
  }

  const client = options.client ?? new RiotClient({ apiKey: riotEnv().RIOT_API_KEY, platform: riotEnv().RIOT_PLATFORM });
  let newMatches = 0;

  /** Releases the lock whatever happened; the status is written by the caller. */
  const finish = async (patch: Database["public"]["Tables"]["sync_state"]["Update"]) => {
    must(
      await db
        .from("sync_state")
        .update({ ...patch, lock_until: null, last_call_count: client.calls, last_rate_limit: client.lastRateLimit ?? null })
        .eq("puuid", puuid),
      "sync_state",
    );
  };

  try {
    const ids = await getMatchIds(client, puuid, { count: options.count ?? MATCH_PAGE_SIZE });
    const missing = await missingMatchIds(db, ids);
    const lookup = missing.length > 0 ? await loadStaticLookup(db) : undefined;

    // One match at a time, each committed on its own: a 429 partway through keeps
    // everything fetched so far (§5.2 layer 5).
    for (const matchId of missing) {
      const raw = await getMatchRaw(client, matchId);
      const dto = client.parse(raw, matchSchema, `match ${matchId}`);
      must(await db.from("matches").upsert(deriveMatch(dto, raw)), "matches");
      must(await db.from("player_matches").upsert(derivePlayerMatch(dto, puuid, lookup!)), "player_matches");
      newMatches++;
    }

    const entries = await getLeagueEntries(client, puuid);
    const ranked = entries.find((entry) => entry.queueType === RANKED_TFT);
    if (ranked) await recordRank(db, puuid, ranked);

    // Profile data changes slowly, so only the daily cron refreshes it.
    if (trigger === "cron") {
      const summoner = await getSummoner(client, puuid);
      must(
        await db
          .from("riot_accounts")
          .update({ profile_icon_id: summoner.profileIconId ?? null, summoner_level: summoner.summonerLevel ?? null })
          .eq("puuid", puuid),
        "riot_accounts",
      );
    }

    const now = Date.now();
    await finish({
      status: "ok",
      last_success_at: new Date(now).toISOString(),
      next_allowed_at: new Date(now + COOLDOWN_S * 1000).toISOString(),
      last_error: null,
    });
    return { status: "ok", newMatches, calls: client.calls };
  } catch (error) {
    if (error instanceof RateLimited) {
      await finish({
        status: "rate_limited",
        next_allowed_at: new Date(Date.now() + error.retryAfterS * 1000).toISOString(),
        last_error: error.message,
      });
      return { status: "rate_limited", retryAfterS: error.retryAfterS, newMatches, calls: client.calls };
    }

    const message = error instanceof AuthError ? "Riot key invalid/expired" : (error as Error).message;
    await finish({
      status: "error",
      // Still cool down: a failing key shouldn't be retried on every page view.
      next_allowed_at: new Date(Date.now() + COOLDOWN_S * 1000).toISOString(),
      last_error: message.slice(0, 500),
    });
    return { status: "error", message, newMatches, calls: client.calls };
  }
}

/** The account the site tracks. Single-user by design (§0). */
export async function getTrackedPuuid(db: Db = getSupabaseAdmin()): Promise<string | undefined> {
  const rows = must(await db.from("riot_accounts").select("puuid").limit(1), "riot_accounts");
  return rows[0]?.puuid;
}

export type SyncState = Database["public"]["Tables"]["sync_state"]["Row"];

/** `sync_state` is server-only (§4.6), so this needs the service-role client. */
export async function getSyncState(puuid: string, db: Db = getSupabaseAdmin()): Promise<SyncState | undefined> {
  return must(await db.from("sync_state").select("*").eq("puuid", puuid).limit(1), "sync_state")[0];
}

/**
 * Whether `/me` should schedule a background sync. Off cooldown and either never
 * synced or last synced over 10 minutes ago; the page still renders cached data first.
 */
export function isStale(state: SyncState | undefined, now = Date.now()): boolean {
  if (!state) return false;
  if (state.next_allowed_at && Date.parse(state.next_allowed_at) > now) return false;
  if (state.lock_until && Date.parse(state.lock_until) > now) return false;
  return !state.last_success_at || now - Date.parse(state.last_success_at) > STALE_AFTER_MS;
}
