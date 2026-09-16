import Link from "next/link";
import { MATCH_THRESHOLD, type CuratedMatch, type CuratedPerformance } from "@/lib/stats/curated-match";
import { TierBadge } from "./tier-row";

/**
 * "How do I actually do when I force Comp X?" — the played boards grouped by the
 * curated comp they came closest to (architecture §6.2 step 4).
 *
 * The sibling of `MeFavoriteComps`, and deliberately a second table rather than a
 * column on it: that one groups by the comp signature — *what the board was* — while
 * this names *what it was going for*. A board can be both "Hunter Primal · Sivir" and
 * an 80% match for Draven Fast 9, and collapsing the two would lose one of them.
 */

const pct = (value: number) => `${Math.round(value * 100)}%`;

const THRESHOLD_NOTE = `A game counts for a comp when it fielded at least ${pct(MATCH_THRESHOLD)} of that comp's board.`;

export function MeCuratedComps({ performance }: { performance: CuratedPerformance }) {
  if (performance.comps.length === 0) {
    return (
      <p className="rounded-md border border-line bg-panel px-3 py-2 text-muted">
        No game in this filter matched a curated comp. {THRESHOLD_NOTE}
      </p>
    );
  }

  return (
    <div className="rounded-md border border-line bg-panel">
      <table className="w-full table-fixed border-collapse">
        <caption className="sr-only">
          Your record on each curated comp. {THRESHOLD_NOTE}
        </caption>
        <thead>
          <tr className="border-b border-line text-left text-[11px] tracking-wider whitespace-nowrap text-faint uppercase">
            <th scope="col" className="px-2 py-1.5 font-medium sm:px-3">Comp</th>
            <th scope="col" className="w-14 px-1 py-1.5 text-right font-medium sm:w-16 sm:px-3">Games</th>
            <th scope="col" className="w-12 px-1 py-1.5 text-right font-medium sm:w-16 sm:px-3">Avg</th>
            <th scope="col" className="w-16 px-2 py-1.5 text-right font-medium sm:px-3">Top 4</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line/60">
          {performance.comps.map((comp) => (
            <tr key={comp.slug}>
              <th scope="row" className="px-2 py-1.5 text-left font-normal sm:px-3">
                <Link href={`/comps/${comp.slug}`} className="flex items-center gap-2 hover:text-accent">
                  <TierBadge tier={comp.tier} className="size-5 shrink-0 text-[11px]" />
                  <span className="truncate">{comp.name}</span>
                </Link>
              </th>
              <td className="px-1 py-1.5 text-right tabular-nums sm:px-3">{comp.games}</td>
              <td className="px-1 py-1.5 text-right tabular-nums sm:px-3">{comp.avgPlacement.toFixed(2)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums sm:px-3">{pct(comp.top4Rate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-line/60 px-2 py-1.5 text-[11px] text-faint sm:px-3">
        {performance.matchedGames} of {performance.games} games matched a curated comp.
      </p>
    </div>
  );
}

/**
 * The comp a single match was going for, on its history row. The share is printed
 * whenever it isn't a full house, because a 60% match is a guess worth labelling as
 * one — the same "honest unknown" rule the header pill follows (architecture §6.4).
 */
export function CuratedCompTag({ match, className = "" }: { match: CuratedMatch; className?: string }) {
  return (
    <Link
      href={`/comps/${match.slug}`}
      title={`${match.name}: ${match.matched} of its ${match.core} board units (${pct(match.overlap)})`}
      className={`inline-flex shrink-0 items-center gap-1 rounded border border-accent/40 bg-accent/10 px-1.5 py-px text-[10px] leading-4 font-medium text-accent hover:border-accent/70 ${className}`}
    >
      <span className="max-w-[8rem] truncate">{match.name}</span>
      {match.overlap < 1 && <span className="tabular-nums opacity-70">{pct(match.overlap)}</span>}
    </Link>
  );
}
