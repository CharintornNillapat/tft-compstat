import { isRankedQueue } from "@/lib/static/game";
import type { MatchRow, StatsFilter } from "./types";

/**
 * Narrows the fetched rows to what a `StatsFilter` asks for (architecture §6.3).
 *
 * Predicates run **before** `lastN`, so "last 50, ranked" means up to 50 ranked
 * games rather than the ranked subset of the last 50. `PlayerSummary.games` carries
 * the real count, and the UI prints that rather than the requested number.
 */
export function selectMatches(
  rows: readonly MatchRow[],
  filter: StatsFilter,
  context: { currentSet: number | null },
): MatchRow[] {
  return [...rows]
    // Sorted defensively: the query already orders by game_datetime desc, but this
    // is a total function over ≤50 rows, so the cost is nil and the tests get simpler.
    .sort((a, b) => b.playedAt.localeCompare(a.playedAt) || b.matchId.localeCompare(a.matchId))
    .filter((row) => (filter.queues === "ranked" ? isRankedQueue(row.queueId) : true))
    .filter((row) =>
      // `currentSet` comes from `tft_sets.is_active`, never from max(setNumber): right
      // after a set rollover with no games played the max is the *old* set, and
      // "current set only" would quietly show last set's games.
      filter.currentSetOnly && context.currentSet !== null ? row.setNumber === context.currentSet : true,
    )
    .slice(0, filter.lastN);
}
