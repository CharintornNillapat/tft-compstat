import "server-only";
import { QUEUE_IDS } from "@/lib/static/game";
import { getStaticNames } from "@/lib/static/lookup";
import { pickNames, type NameBook } from "@/lib/static/names";
import { must } from "@/lib/supabase/result";
import { getSupabase } from "@/lib/supabase/server";
import { getTrackedPuuid } from "@/lib/sync/sync-service";
import type { RankSnapshot } from "./rank";
import { namesUsedBy, toMatchRow } from "./row";
import { FETCH_LIMIT, type MatchRow } from "./types";

/**
 * Reads for `/me` and `/`. **Uncached on purpose** (architecture §6.3): the header
 * shows a live cooldown countdown, and `after()` stale-on-read writes new matches
 * after the response has flushed, so a cached read would serve stale data for a
 * whole cache lifetime. What makes these pages fast is Partial Prerender — a static
 * shell with these streamed in — not a data cache.
 *
 * Everything here uses the anon client: `player_matches`, `riot_accounts` and
 * `rank_snapshots` are all anon-readable under RLS (§4.6), so the stats path needs
 * no service role at all. Only the sync badge does, which is why it's its own island.
 */

type Db = ReturnType<typeof getSupabase>;

const RANKED_TFT = "RANKED_TFT";

/** The newest two snapshots, so the header can show an LP delta. */
export async function getLatestRank(
  db: Db,
  puuid: string,
): Promise<{ current: RankSnapshot | null; previous: RankSnapshot | null }> {
  const rows = must(
    await db
      .from("rank_snapshots")
      .select("tier, division, lp, wins, losses, captured_at")
      .eq("puuid", puuid)
      .eq("queue_type", RANKED_TFT)
      .order("captured_at", { ascending: false })
      .limit(2),
    "rank snapshots",
  );
  const toSnapshot = (row: (typeof rows)[number]): RankSnapshot => ({
    tier: row.tier,
    division: row.division,
    lp: row.lp,
    wins: row.wins,
    losses: row.losses,
    capturedAt: row.captured_at,
  });
  return {
    current: rows[0] ? toSnapshot(rows[0]) : null,
    previous: rows[1] ? toSnapshot(rows[1]) : null,
  };
}

async function loadMatches(db: Db, puuid: string, limit: number): Promise<MatchRow[]> {
  const rows = must(
    await db
      .from("player_matches")
      .select("*")
      .eq("puuid", puuid)
      .order("game_datetime", { ascending: false })
      // Ties break on match id so the order never flickers between renders.
      .order("match_id", { ascending: false })
      .limit(limit),
    "player matches",
  );
  return rows.map(toMatchRow);
}

/** Trims the full static book down to what these rows actually reference. */
async function namesFor(rows: readonly MatchRow[]): Promise<{ names: NameBook; activeSet: { id: number; name: string } | null }> {
  const book = await getStaticNames();
  return { names: pickNames(book.names, namesUsedBy(rows)), activeSet: book.activeSet };
}

export type DashboardData = {
  account: { gameName: string; tagLine: string; platform: string } | null;
  /** Newest first, at most `FETCH_LIMIT`. Every `StatsFilter` narrows this set. */
  rows: MatchRow[];
  names: NameBook;
  rank: { current: RankSnapshot | null; previous: RankSnapshot | null };
  currentSet: number | null;
  setName: string | null;
};

/** Null when no account is tracked yet. */
export async function getDashboardData(limit = FETCH_LIMIT): Promise<DashboardData | null> {
  const db = getSupabase();
  const puuid = await getTrackedPuuid(db);
  if (!puuid) return null;

  const [account, rows, rank] = await Promise.all([
    must(
      await db.from("riot_accounts").select("game_name, tag_line, platform").eq("puuid", puuid).limit(1),
      "riot account",
    ).at(0),
    loadMatches(db, puuid, limit),
    getLatestRank(db, puuid),
  ]);

  const { names, activeSet } = await namesFor(rows);

  return {
    account: account
      ? { gameName: account.game_name, tagLine: account.tag_line, platform: account.platform }
      : null,
    rows,
    names,
    rank,
    currentSet: activeSet?.id ?? null,
    setName: activeSet?.name ?? null,
  };
}

export type GlanceData = {
  rank: { current: RankSnapshot | null; previous: RankSnapshot | null };
  /** Last 10 ranked games, newest first. */
  recent: MatchRow[];
  names: NameBook;
};

export async function getGlanceData(): Promise<GlanceData | null> {
  const db = getSupabase();
  const puuid = await getTrackedPuuid(db);
  if (!puuid) return null;

  const [rank, rows] = await Promise.all([
    getLatestRank(db, puuid),
    must(
      await db
        .from("player_matches")
        .select("*")
        .eq("puuid", puuid)
        .eq("queue_id", QUEUE_IDS.ranked)
        .order("game_datetime", { ascending: false })
        .order("match_id", { ascending: false })
        .limit(10),
      "recent ranked matches",
    ),
  ]);

  const recent = rows.map(toMatchRow);
  const { names } = await namesFor(recent);
  return { rank, recent, names };
}
