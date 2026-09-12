import { EMPTY_DIST, TOP4_CUTOFF, type MatchRow, type PlacementDist, type PlayerSummary } from "./types";

/**
 * Headline numbers for the dashboard (architecture §6.3). Sub-millisecond over
 * 20–50 rows, so it's recomputed on every filter change rather than cached.
 */
export function summarize(rows: readonly MatchRow[]): PlayerSummary {
  const games = rows.length;
  if (games === 0) {
    // All-zero rather than NaN. The UI branches on `games === 0` to an empty state,
    // so it never has to render "0.00 avg" as though it meant something.
    return {
      games: 0,
      avgPlacement: 0,
      top4Rate: 0,
      winRate: 0,
      avgLevel: 0,
      placementDist: EMPTY_DIST,
      recent: [],
    };
  }

  const dist: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
  let placementTotal = 0;
  let top4 = 0;
  let wins = 0;
  let levelTotal = 0;
  let levelled = 0;

  for (const row of rows) {
    placementTotal += row.placement;
    if (row.placement <= TOP4_CUTOFF) top4 += 1;
    if (row.placement === 1) wins += 1;
    // Double Up lobbies place 1–4, and an unexpected value must not corrupt the
    // histogram, so anything outside 1–8 is counted in the averages but not bucketed.
    const bucket = row.placement - 1;
    // `?? 0` rather than `+= 1`: noUncheckedIndexedAccess types an index read as
    // possibly undefined, and the bounds check above doesn't narrow it.
    if (bucket >= 0 && bucket < dist.length) dist[bucket] = (dist[bucket] ?? 0) + 1;
    if (row.level !== null) {
      levelTotal += row.level;
      levelled += 1;
    }
  }

  return {
    games,
    avgPlacement: placementTotal / games,
    top4Rate: top4 / games,
    winRate: wins / games,
    avgLevel: levelled === 0 ? 0 : levelTotal / levelled,
    placementDist: dist as unknown as PlacementDist,
    recent: rows.map((row) => row.placement),
  };
}
