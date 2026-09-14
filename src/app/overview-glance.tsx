import { EmptyState } from "@/components/empty-state";
import { PlacementPill } from "@/components/placement-pill";
import { RelativeTime } from "@/components/relative-time";
import { Sparkline } from "@/components/sparkline";
import { formatLp, formatRank, lpDelta, rankRecord } from "@/lib/stats/rank";
import { getGlanceData } from "@/lib/stats/queries";
import { summarize } from "@/lib/stats/summary";
import { OverviewPanel } from "./overview-panel";

/**
 * The player half of the overview: rank and the last ten ranked games in one card.
 * Uncached, like every other player read (architecture §6.3), so it lives in the
 * page's Suspense boundary.
 *
 * One `<section>`, so it drops straight into the parent's grid as one cell — Suspense
 * creates no DOM box of its own.
 */
export async function OverviewGlance() {
  const data = await getGlanceData();

  if (!data || data.recent.length === 0) {
    return (
      <OverviewPanel title="Ranked">
        <EmptyState title="No ranked games cached">Run a sync from the Me page.</EmptyState>
      </OverviewPanel>
    );
  }

  const delta = lpDelta(data.rank.current, data.rank.previous);
  const lp = formatLp(data.rank.current);
  const record = rankRecord(data.rank.current);
  const summary = summarize(data.recent);
  // Newest first from the query; the chart and pills both read left to right in time.
  const placements = [...summary.recent].reverse();
  const top4 = Math.round(summary.top4Rate * summary.games);

  return (
    <OverviewPanel
      title="Ranked"
      // The newest game rather than the rank snapshot's time: a game is what a sync
      // actually brings in, so "last game" can't claim freshness the data lacks.
      aside={
        <span>
          Last game <RelativeTime iso={data.recent[0]?.playedAt ?? null} />
        </span>
      }
    >
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-baseline gap-2">
            <span className="text-xl leading-tight font-semibold text-accent">{formatRank(data.rank.current)}</span>
            {lp && <span className="text-muted tabular-nums">{lp}</span>}
            {delta !== null && delta !== 0 && (
              <span className={`tabular-nums ${delta > 0 ? "text-place-top4" : "text-tier-s"}`}>
                {delta > 0 ? `+${delta}` : delta}
              </span>
            )}
          </p>
          {record && (
            <p className="text-faint tabular-nums">
              {record.wins}W {record.losses}L · {Math.round(record.winRate * 100)}% season
            </p>
          )}
        </div>

        <dl className="flex gap-4">
          <Figure label="Avg place" value={summary.avgPlacement.toFixed(1)} />
          <Figure label="Top 4" value={`${top4}/${summary.games}`} />
        </dl>
      </div>

      <p className="mt-3 mb-1 text-[11px] text-faint">Last {summary.games} ranked games, oldest to newest</p>
      <Sparkline
        values={placements}
        height={32}
        label={`Placement over the last ${placements.length} ranked games, most recent ${placements.at(-1)}`}
      />
      <div className="mt-1.5 flex flex-wrap gap-0.5">
        {placements.map((placement, i, all) => (
          <PlacementPill key={i} placement={placement} size="sm" emphasis={i === all.length - 1} />
        ))}
      </div>
    </OverviewPanel>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right">
      <dt className="text-[11px] text-faint">{label}</dt>
      <dd className="text-base leading-tight font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
