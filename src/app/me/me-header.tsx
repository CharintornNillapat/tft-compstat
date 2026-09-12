import { after } from "next/server";
import { RefreshButton } from "@/components/refresh-button";
import { RelativeTime } from "@/components/relative-time";
import { SyncNotice } from "@/components/sync-notice";
import { formatLp, formatRank, lpDelta } from "@/lib/stats/rank";
import { getLatestRank } from "@/lib/stats/queries";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { must } from "@/lib/supabase/result";
import { getSyncState, getTrackedPuuid, isStale, syncPlayer } from "@/lib/sync/sync-service";

/**
 * The dashboard header: who we're tracking, their rank, and the state of the cache
 * (architecture §5.3). Its own Suspense island because it needs the service-role
 * read of `sync_state` and must paint first — it answers "am I looking at fresh
 * data?" — so it mustn't queue behind the 50-row stats query.
 *
 * Reads only Supabase, then schedules a background sync with `after()` when the
 * cache is stale: the page has already rendered by the time Riot is called.
 */

/**
 * Reading the clock is a side effect, so it's awaited rather than called during
 * render (React's purity rule). Relative times are formatted on the client, where
 * they can stay current; this is only for the staleness decision.
 */
async function readClock(): Promise<number> {
  return Date.now();
}

const STATUS_LABELS: Record<string, string> = {
  idle: "Never synced",
  running: "Syncing…",
  ok: "Synced",
  error: "Error",
  rate_limited: "Rate limited",
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line/60 py-1 last:border-0">
      <span className="text-faint">{label}</span>
      <span className="tabular-nums">{children}</span>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <section className="rounded-md border border-line bg-panel p-3">{children}</section>;
}

export async function MeHeader() {
  const db = getSupabaseAdmin();
  const puuid = await getTrackedPuuid(db);
  if (!puuid) {
    return (
      <Panel>
        <h2 className="font-medium">Match sync</h2>
        <p className="mt-1 text-muted">
          No account is being tracked yet. Run <code className="text-zinc-300">pnpm riot:setup</code>.
        </p>
      </Panel>
    );
  }

  const [now, account, state, matches, rank] = await Promise.all([
    readClock(),
    must(
      await db.from("riot_accounts").select("game_name,tag_line,platform").eq("puuid", puuid).limit(1),
      "riot_accounts",
    ).at(0),
    getSyncState(puuid, db),
    must(await db.from("player_matches").select("match_id").eq("puuid", puuid), "player_matches"),
    getLatestRank(db, puuid),
  ]);

  // Fire-and-forget: the response is already on its way to the browser.
  if (isStale(state, now)) {
    after(async () => {
      await syncPlayer(puuid, "stale-read");
    });
  }

  const delta = lpDelta(rank.current, rank.previous);
  const lp = formatLp(rank.current);

  return (
    <div className="space-y-3">
      <SyncNotice state={state ?? null} now={now} />
      <Panel>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-medium">
            {account ? `${account.game_name}#${account.tag_line}` : "Match sync"}{" "}
            {account && <span className="text-faint">· {account.platform}</span>}
          </h2>
          <span className="text-muted">{STATUS_LABELS[state?.status ?? "idle"] ?? state?.status}</span>
        </div>

        <div className="mt-2 flex flex-wrap items-baseline gap-2">
          <span className="text-lg font-semibold text-accent">{formatRank(rank.current)}</span>
          {lp && <span className="text-muted tabular-nums">{lp}</span>}
          {delta !== null && delta !== 0 && (
            <span className={`tabular-nums ${delta > 0 ? "text-place-top4" : "text-tier-s"}`}>
              {delta > 0 ? `+${delta}` : delta}
            </span>
          )}
        </div>

        <div className="mt-2">
          <Row label="Cached matches">{matches.length}</Row>
          <Row label="Last success">
            <RelativeTime iso={state?.last_success_at ?? null} fallback="never" />
          </Row>
          <Row label="Last run">{state?.last_call_count == null ? "—" : `${state.last_call_count} calls`}</Row>
        </div>

        <div className="mt-3">
          <RefreshButton nextAllowedAt={state?.next_allowed_at ?? null} />
        </div>
      </Panel>
    </div>
  );
}
