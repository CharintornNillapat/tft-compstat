import { PlacementPill } from "@/components/placement-pill";
import { Sparkline } from "@/components/sparkline";
import { EmptyState } from "@/components/empty-state";
import { formatLp, formatRank, lpDelta, rankRecord } from "@/lib/stats/rank";
import { getGlanceData } from "@/lib/stats/queries";

/**
 * The player half of the overview. Uncached, like every other player read
 * (architecture §6.3), so it lives in the page's Suspense boundary.
 *
 * Returns a **fragment of two sections** so they drop straight into the parent's
 * grid — Suspense creates no DOM box of its own, so a wrapper here would collapse
 * the three columns into two.
 */
export async function OverviewGlance() {
  const data = await getGlanceData();

  if (!data || data.recent.length === 0) {
    return (
      <>
        <Panel title="Rank & LP">
          <p className="text-muted">No rank snapshot yet.</p>
        </Panel>
        <Panel title="Last 10 placements">
          <EmptyState title="No ranked games cached">Run a sync from the Me page.</EmptyState>
        </Panel>
      </>
    );
  }

  const delta = lpDelta(data.rank.current, data.rank.previous);
  const lp = formatLp(data.rank.current);
  const record = rankRecord(data.rank.current);
  // Newest first from the query; the chart and pills both read left to right in time.
  const placements = [...data.recent].map((row) => row.placement).reverse();

  return (
    <>
      <Panel title="Rank & LP">
        <p className="flex flex-wrap items-baseline gap-2">
          <span className="text-lg font-semibold text-accent">{formatRank(data.rank.current)}</span>
          {lp && <span className="text-muted tabular-nums">{lp}</span>}
          {delta !== null && delta !== 0 && (
            <span className={`tabular-nums ${delta > 0 ? "text-place-top4" : "text-tier-s"}`}>
              {delta > 0 ? `+${delta}` : delta}
            </span>
          )}
        </p>
        {record && (
          <p className="mt-1 text-faint tabular-nums">
            {record.wins}W {record.losses}L · {Math.round(record.winRate * 100)}%
          </p>
        )}
      </Panel>

      <Panel title="Last 10 placements">
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
      </Panel>
    </>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-line bg-panel p-3">
      <h2 className="mb-1.5 text-[11px] tracking-wider text-faint uppercase">{title}</h2>
      {children}
    </section>
  );
}
