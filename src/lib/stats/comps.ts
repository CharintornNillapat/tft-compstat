import { labelNames, type NameBook } from "@/lib/static/names";
import { compKey as buildCompKey, signatureLabel } from "@/lib/sync/comp-signature";
import { TOP4_CUTOFF, type CompStat, type MatchRow } from "./types";

/**
 * Which comps you actually play, and how they do (architecture §6.3). Grouped on
 * `player_matches.comp_key`, the signature Phase 4 already derived, so the grouping
 * can never drift from what the sync stored.
 */

const DEFAULTS = { limit: 8, minGames: 1 };

export function favoriteComps(
  rows: readonly MatchRow[],
  names: NameBook,
  options: { limit?: number; minGames?: number } = {},
): CompStat[] {
  const { limit, minGames } = { ...DEFAULTS, ...options };
  const groups = new Map<string, { rows: MatchRow[] }>();

  for (const row of rows) {
    // A row with no signature still groups: `compKey(undefined, [])` is "|", the same
    // key the sync would have written, so bust-outs collect together instead of vanishing.
    const key = row.compKey ?? buildCompKey(undefined, []);
    const group = groups.get(key) ?? { rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }

  const resolvers = labelNames(names);

  return [...groups.entries()]
    .filter(([, group]) => group.rows.length >= minGames)
    .map(([key, group]) => {
      // Labels come from the newest row in the group: every row shares the key, so
      // they share the carry and traits too, and this avoids a second lookup table.
      const sample = group.rows[0]!;
      return {
        compKey: key,
        label: signatureLabel(
          { carryUnit: sample.carryUnit ?? undefined, primaryTraits: sample.primaryTraits },
          resolvers,
        ),
        games: group.rows.length,
        avgPlacement: group.rows.reduce((sum, row) => sum + row.placement, 0) / group.rows.length,
        top4Rate: group.rows.filter((row) => row.placement <= TOP4_CUTOFF).length / group.rows.length,
      };
    })
    .sort((a, b) => b.games - a.games || a.avgPlacement - b.avgPlacement || a.label.localeCompare(b.label))
    .slice(0, limit);
}
