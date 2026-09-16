"use client";

import { useMemo, useState } from "react";
import type { NameBook } from "@/lib/static/names";
import { favoriteComps } from "@/lib/stats/comps";
import { curatedPerformance, matchCuratedComps, type CuratedCompShape } from "@/lib/stats/curated-match";
import { selectMatches } from "@/lib/stats/filter";
import { summarize } from "@/lib/stats/summary";
import { DEFAULT_FILTER, LAST_N_OPTIONS, type LastN, type MatchRow, type StatsFilter } from "@/lib/stats/types";
import { EmptyState } from "./empty-state";
import { MeCuratedComps } from "./me-curated-comps";
import { MeFavoriteComps } from "./me-favorite-comps";
import { MeMatchHistory } from "./me-match-history";
import { PlacementHistogram } from "./placement-histogram";
import { PlacementPill } from "./placement-pill";
import { Segmented } from "./segmented";
import { Sparkline } from "./sparkline";
import { StatTile } from "./stat-tile";

/**
 * The dashboard's one stateful piece. The server sends up to 50 rows once; every
 * filter change recomputes in the browser with the same pure functions, so
 * switching 10/20/50 or ranked/all costs no round trip (architecture §6.3).
 */

const QUEUE_OPTIONS = [
  { value: "ranked" as const, label: "Ranked" },
  { value: "all" as const, label: "All" },
];
const SET_OPTIONS = [
  { value: "current" as const, label: "Current" },
  { value: "all" as const, label: "All" },
];

const pct = (value: number) => `${Math.round(value * 100)}%`;

export function MeDashboard({
  rows,
  names,
  currentSet,
  setName,
  curatedComps,
}: {
  rows: MatchRow[];
  names: NameBook;
  currentSet: number | null;
  setName: string | null;
  curatedComps: CuratedCompShape[];
}) {
  const [filter, setFilter] = useState<StatsFilter>(DEFAULT_FILTER);

  const { visible, summary, comps, curatedMatches, curated } = useMemo(() => {
    const selected = selectMatches(rows, filter, { currentSet });
    // Matched once per filter change, then read by both the history rows and the
    // per-comp table, so the two can never name a board differently.
    const matches = matchCuratedComps(selected, curatedComps);
    return {
      visible: selected,
      summary: summarize(selected),
      comps: favoriteComps(selected, names, { limit: 6 }),
      curatedMatches: matches,
      curated: curatedPerformance(selected, matches),
    };
  }, [rows, filter, currentSet, names, curatedComps]);

  const lastNOptions = LAST_N_OPTIONS.map((n) => ({ value: n, label: String(n) }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Segmented<LastN>
          label="Games"
          options={lastNOptions}
          value={filter.lastN}
          onChange={(lastN) => setFilter((f) => ({ ...f, lastN }))}
        />
        <Segmented
          label="Queue"
          options={QUEUE_OPTIONS}
          value={filter.queues}
          onChange={(queues) => setFilter((f) => ({ ...f, queues }))}
        />
        <Segmented
          label="Set"
          options={SET_OPTIONS}
          value={filter.currentSetOnly ? "current" : "all"}
          onChange={(set) => setFilter((f) => ({ ...f, currentSetOnly: set === "current" }))}
        />
        {/* The real count, which a filtered lastN makes smaller than the number asked for. */}
        <span aria-live="polite" className="text-faint tabular-nums">
          {summary.games} {summary.games === 1 ? "game" : "games"}
          {filter.currentSetOnly && setName ? ` · ${setName}` : ""}
        </span>
      </div>

      {summary.games === 0 ? (
        <EmptyState title={filter.currentSetOnly ? "No ranked games this set" : "No games match this filter"}>
          Widen the filter above, or run a sync to pull in recent matches.
        </EmptyState>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatTile label="Avg place" value={summary.avgPlacement.toFixed(2)} />
            <StatTile
              label="Top 4"
              value={pct(summary.top4Rate)}
              tone={summary.top4Rate >= 0.5 ? "good" : "default"}
            />
            <StatTile label="Wins" value={pct(summary.winRate)} hint={`${summary.placementDist[0]} firsts`} />
            <StatTile label="Avg level" value={summary.avgLevel.toFixed(1)} />
          </dl>

          <section className="grid gap-3 rounded-md border border-line bg-panel p-3 md:grid-cols-2">
            <div>
              <h3 className="text-[11px] tracking-wider text-faint uppercase">Placement trend</h3>
              {/* `recent` is newest first (§6.3); the chart reads left to right in time. */}
              <Sparkline
                className="mt-2"
                values={[...summary.recent].reverse()}
                label={`Placement over the last ${summary.games} games, most recent ${summary.recent[0] ?? "none"}, average ${summary.avgPlacement.toFixed(2)}`}
              />
              <div className="mt-1.5 flex flex-wrap gap-0.5">
                {[...summary.recent].reverse().map((placement, i, all) => (
                  <PlacementPill key={i} placement={placement} size="sm" emphasis={i === all.length - 1} />
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-[11px] tracking-wider text-faint uppercase">Distribution</h3>
              <PlacementHistogram className="mt-2" dist={summary.placementDist} />
            </div>
          </section>

          {comps.length > 0 && (
            <section>
              <h3 className="mb-1.5 text-[11px] tracking-wider text-faint uppercase">Favorite comps</h3>
              <MeFavoriteComps comps={comps} names={names} />
            </section>
          )}

          {curatedComps.length > 0 && (
            <section>
              <h3 className="mb-1.5 text-[11px] tracking-wider text-faint uppercase">On curated comps</h3>
              <MeCuratedComps performance={curated} />
            </section>
          )}

          <section>
            <h3 className="mb-1.5 text-[11px] tracking-wider text-faint uppercase">Match history</h3>
            <MeMatchHistory rows={visible} names={names} curatedMatches={curatedMatches} />
          </section>
        </>
      )}
    </div>
  );
}
