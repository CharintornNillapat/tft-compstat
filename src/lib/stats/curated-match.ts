import type { TierRank } from "@/lib/static/game";
import { TOP4_CUTOFF, type MatchRow } from "./types";

/**
 * Played boards against the curated comps (architecture §6.2 step 4) — the half of
 * `/me` that answers "how do I actually do when I force Comp X?".
 *
 * Pure and unversioned, unlike `comp-signature.ts`: nothing here is stored, so the
 * threshold can move without a `derived_version` bump or a re-derive. The comp
 * signature groups boards by *what they were*; this names them after *what they were
 * trying to be*, which is why both live on the dashboard rather than one replacing
 * the other.
 */

/**
 * A curated comp reduced to what matching needs. Built by `getCuratedCompShapes()`
 * rather than `getComps()` so the browser gets ~10 strings a comp instead of icons,
 * items, traits and guides.
 */
export type CuratedCompShape = {
  slug: string;
  name: string;
  tier: TierRank;
  /** Its set. A board from another set can never match it, however the names overlap. */
  setId: number;
  /**
   * The comp's final board. `early_units` and `flex_units` are deliberately left out:
   * early units are a stage-2 holder that the comp expects you to sell, and flex units
   * are alternatives, so counting either would make "you played this comp" easier to
   * claim the *less* of it you actually built.
   */
  coreUnits: string[];
};

/** Share of a comp's core units that must be on the board to call it a match (§6.2). */
export const MATCH_THRESHOLD = 0.6;

export type CuratedMatch = {
  slug: string;
  name: string;
  tier: TierRank;
  /** `matched / core`, 0–1. */
  overlap: number;
  /** Core units found on the board. */
  matched: number;
  /** Core units the comp has. */
  core: number;
};

/**
 * The curated comp this board came closest to, or null when none clears the
 * threshold. Ties go to the comp with **more** core units: two comps fully present
 * on the same board means the longer one is the more specific claim, and a 4-unit
 * comp would otherwise win every board that happened to contain it.
 */
export function matchCuratedComp(
  row: Pick<MatchRow, "setNumber" | "units">,
  shapes: readonly CuratedCompShape[],
  threshold: number = MATCH_THRESHOLD,
): CuratedMatch | null {
  const board = new Set(row.units.map((unit) => unit.character_id));
  if (board.size === 0) return null;

  let best: CuratedMatch | null = null;
  for (const shape of shapes) {
    if (shape.setId !== row.setNumber) continue;
    // Deduplicated defensively: the seed schema already rejects a repeated unit, and
    // a duplicate here would otherwise deflate the share it can reach.
    const core = new Set(shape.coreUnits);
    if (core.size === 0) continue;

    let matched = 0;
    for (const unit of core) if (board.has(unit)) matched += 1;
    const overlap = matched / core.size;
    if (overlap < threshold) continue;

    const candidate: CuratedMatch = {
      slug: shape.slug,
      name: shape.name,
      tier: shape.tier,
      overlap,
      matched,
      core: core.size,
    };
    if (
      best === null ||
      candidate.overlap > best.overlap ||
      (candidate.overlap === best.overlap &&
        (candidate.core > best.core || (candidate.core === best.core && candidate.slug < best.slug)))
    ) {
      best = candidate;
    }
  }
  return best;
}

/** Every row that matched a curated comp, keyed by `matchId`. Unmatched rows are absent. */
export function matchCuratedComps(
  rows: readonly MatchRow[],
  shapes: readonly CuratedCompShape[],
  threshold: number = MATCH_THRESHOLD,
): Map<string, CuratedMatch> {
  const matches = new Map<string, CuratedMatch>();
  for (const row of rows) {
    const match = matchCuratedComp(row, shapes, threshold);
    if (match) matches.set(row.matchId, match);
  }
  return matches;
}

export type CuratedCompStat = {
  slug: string;
  name: string;
  tier: TierRank;
  games: number;
  /** Unrounded, like `PlayerSummary.avgPlacement`; formatted at render. */
  avgPlacement: number;
  /** 0–1. */
  top4Rate: number;
};

export type CuratedPerformance = {
  /** Most played first, then best average, then name. */
  comps: CuratedCompStat[];
  /** Rows that matched some curated comp. */
  matchedGames: number;
  /** Rows considered, so the UI can print "7 of 20" rather than a bare count. */
  games: number;
};

/**
 * Per-comp records over the rows already matched. Takes the map rather than the
 * shapes so a render matches each board once and both the history rows and this
 * table read the same answer.
 */
export function curatedPerformance(
  rows: readonly MatchRow[],
  matches: ReadonlyMap<string, CuratedMatch>,
): CuratedPerformance {
  const groups = new Map<string, { match: CuratedMatch; rows: MatchRow[] }>();

  for (const row of rows) {
    const match = matches.get(row.matchId);
    if (!match) continue;
    const group = groups.get(match.slug) ?? { match, rows: [] };
    group.rows.push(row);
    groups.set(match.slug, group);
  }

  const comps = [...groups.values()]
    .map(({ match, rows: played }) => ({
      slug: match.slug,
      name: match.name,
      tier: match.tier,
      games: played.length,
      avgPlacement: played.reduce((sum, row) => sum + row.placement, 0) / played.length,
      top4Rate: played.filter((row) => row.placement <= TOP4_CUTOFF).length / played.length,
    }))
    .sort((a, b) => b.games - a.games || a.avgPlacement - b.avgPlacement || a.name.localeCompare(b.name));

  return {
    comps,
    matchedGames: comps.reduce((sum, comp) => sum + comp.games, 0),
    games: rows.length,
  };
}
