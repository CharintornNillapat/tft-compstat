import { queueLabel, QUEUE_IDS } from "@/lib/static/game";
import type { NameBook } from "@/lib/static/names";
import { labelNames } from "@/lib/static/names";
import type { CuratedMatch } from "@/lib/stats/curated-match";
import { carryItems, matchTraits } from "@/lib/stats/row";
import type { MatchRow } from "@/lib/stats/types";
import { signatureLabel } from "@/lib/sync/comp-signature";
import { CarryCell } from "./me-comp-cell";
import { CuratedCompTag } from "./me-curated-comps";
import { PlacementPill } from "./placement-pill";
import { RelativeTime } from "./relative-time";
import { TraitHex } from "./trait-badge";

/** How many trait hexes fit a dense row before it starts to wrap badly. */
const MAX_TRAITS = 5;

/**
 * Recent games, newest first — a list, not a timeline, so it keeps the order the
 * query returned rather than the sparkline's oldest-to-newest direction.
 *
 * One row per game on a desktop width. Below `sm` the trailing metadata (traits,
 * level, queue, time) folds onto a second line under the comp name instead of
 * wrapping raggedly through the middle of the row, so the placement, carry and name
 * stay on one line at 400px.
 */
export function MeMatchHistory({
  rows,
  names,
  curatedMatches,
}: {
  rows: readonly MatchRow[];
  names: NameBook;
  /** The curated comp each game came closest to, keyed by match id. Unmatched games are absent. */
  curatedMatches: ReadonlyMap<string, CuratedMatch>;
}) {
  const resolvers = labelNames(names);

  return (
    <ol className="divide-y divide-line/60 rounded-md border border-line bg-panel">
      {rows.map((row) => {
        const traits = matchTraits(row, names).slice(0, MAX_TRAITS);
        const label = signatureLabel(
          { carryUnit: row.carryUnit ?? undefined, primaryTraits: row.primaryTraits },
          resolvers,
        );
        const curated = curatedMatches.get(row.matchId);

        return (
          <li key={row.matchId} className="flex items-center gap-2.5 px-2.5 py-2 sm:gap-3 sm:px-3">
            <PlacementPill placement={row.placement} />

            <CarryCell carryUnit={row.carryUnit} items={carryItems(row)} names={names} />

            <div className="flex min-w-0 flex-1 flex-col gap-y-1 sm:flex-row sm:items-center sm:gap-x-3">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate font-medium">{label}</span>
                {curated && <CuratedCompTag match={curated} />}
              </span>

              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 sm:ml-auto sm:shrink-0">
                <span className="flex items-center gap-0.5">
                  {traits.map((trait) => (
                    <span key={trait.apiName} title={`${trait.name} ${trait.count}`}>
                      <TraitHex trait={{ name: trait.name, iconUrl: trait.iconUrl, style: trait.style }} size={18} />
                    </span>
                  ))}
                </span>

                <span className="text-faint tabular-nums">{row.level === null ? "—" : `lv ${row.level}`}</span>

                {row.queueId !== QUEUE_IDS.ranked && (
                  <span className="rounded border border-line px-1 text-[11px] text-faint">
                    {queueLabel(row.queueId)}
                  </span>
                )}

                <span className="text-faint">
                  <RelativeTime iso={row.playedAt} />
                </span>
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
