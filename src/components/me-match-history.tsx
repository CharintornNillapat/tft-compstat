import { queueLabel, QUEUE_IDS } from "@/lib/static/game";
import type { NameBook } from "@/lib/static/names";
import { labelNames } from "@/lib/static/names";
import { carryItems, matchTraits } from "@/lib/stats/row";
import type { MatchRow } from "@/lib/stats/types";
import { signatureLabel } from "@/lib/sync/comp-signature";
import { CarryCell } from "./me-comp-cell";
import { PlacementPill } from "./placement-pill";
import { RelativeTime } from "./relative-time";
import { TraitHex } from "./trait-badge";

/** How many trait hexes fit a dense row before it starts to wrap badly. */
const MAX_TRAITS = 5;

/**
 * Recent games, newest first — a list, not a timeline, so it keeps the order the
 * query returned rather than the sparkline's oldest-to-newest direction.
 */
export function MeMatchHistory({ rows, names }: { rows: readonly MatchRow[]; names: NameBook }) {
  const resolvers = labelNames(names);

  return (
    <ol className="divide-y divide-line/60 rounded-md border border-line bg-panel">
      {rows.map((row) => {
        const traits = matchTraits(row, names).slice(0, MAX_TRAITS);
        const label = signatureLabel(
          { carryUnit: row.carryUnit ?? undefined, primaryTraits: row.primaryTraits },
          resolvers,
        );

        return (
          <li key={row.matchId} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2">
            <PlacementPill placement={row.placement} />

            <CarryCell carryUnit={row.carryUnit} items={carryItems(row)} names={names} />

            <span className="min-w-0 flex-1 truncate font-medium">{label}</span>

            <span className="flex shrink-0 items-center gap-0.5">
              {traits.map((trait) => (
                <span key={trait.apiName} title={`${trait.name} ${trait.count}`}>
                  <TraitHex trait={{ name: trait.name, iconUrl: trait.iconUrl, style: trait.style }} size={18} />
                </span>
              ))}
            </span>

            <span className="shrink-0 text-faint tabular-nums">
              {row.level === null ? "—" : `lv ${row.level}`}
            </span>

            {row.queueId !== QUEUE_IDS.ranked && (
              <span className="shrink-0 rounded border border-line px-1 text-[11px] text-faint">
                {queueLabel(row.queueId)}
              </span>
            )}

            <span className="shrink-0 text-right text-faint">
              <RelativeTime iso={row.playedAt} />
            </span>
          </li>
        );
      })}
    </ol>
  );
}
