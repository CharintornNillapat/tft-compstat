import type { MatchRow, UnitStat } from "./types";

/**
 * Which units and items you field, and how they do (architecture §6.3).
 *
 * **Counted once per match.** Two Deathblades on one board, or the same champion
 * fielded twice, count once — mirroring `computeActiveTraits`' once-per-trait rule.
 * That makes `games` mean "matches where I fielded X", which is the only reading
 * under which `avgPlacement` is well defined.
 */

const DEFAULTS = { limit: 10, minGames: 2 };

function tally(
  rows: readonly MatchRow[],
  namesOf: (row: MatchRow) => Iterable<string>,
  options: { limit?: number; minGames?: number },
): UnitStat[] {
  const { limit, minGames } = { ...DEFAULTS, ...options };
  const totals = new Map<string, { games: number; placementTotal: number }>();

  for (const row of rows) {
    for (const apiName of new Set(namesOf(row))) {
      const entry = totals.get(apiName) ?? { games: 0, placementTotal: 0 };
      entry.games += 1;
      entry.placementTotal += row.placement;
      totals.set(apiName, entry);
    }
  }

  return [...totals.entries()]
    .filter(([, entry]) => entry.games >= minGames)
    .map(([apiName, entry]) => ({
      apiName,
      games: entry.games,
      avgPlacement: entry.placementTotal / entry.games,
    }))
    .sort((a, b) => a.avgPlacement - b.avgPlacement || b.games - a.games || a.apiName.localeCompare(b.apiName))
    .slice(0, limit);
}

export function topChampions(
  rows: readonly MatchRow[],
  options: { limit?: number; minGames?: number } = {},
): UnitStat[] {
  return tally(rows, (row) => row.units.map((unit) => unit.character_id), options);
}

export function topItems(
  rows: readonly MatchRow[],
  options: { limit?: number; minGames?: number } = {},
): UnitStat[] {
  return tally(rows, (row) => row.units.flatMap((unit) => unit.items), options);
}
