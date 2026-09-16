import type { BisRole, ChampionCost } from "@/lib/static/game";
import { isChampionCost } from "@/lib/static/game";
import type { BisChampion, BisItem } from "./bis";

export type BisFilterOptions = {
  costs?: ReadonlySet<ChampionCost>;
  roles?: ReadonlySet<BisRole>;
  query?: string;
};

/**
 * Pure filtering for champion item builds on `/bis`.
 *
 * Matches:
 * - Cost and Role sets
 * - Search query against champion name, role, notes, and item names/components
 *   across primary, secondary (flex), and special (artifact/radiant) builds.
 */
export function filterBisChampions(
  champions: readonly BisChampion[],
  options: BisFilterOptions,
): BisChampion[] {
  const { costs, roles, query } = options;
  const q = query?.trim().toLowerCase();

  return champions.filter((champion) => {
    if (costs && costs.size > 0 && (!isChampionCost(champion.cost) || !costs.has(champion.cost))) {
      return false;
    }
    if (roles && roles.size > 0 && !roles.has(champion.role)) {
      return false;
    }
    if (!q) return true;

    // Champion name match
    if (champion.name.toLowerCase().includes(q)) return true;

    // Role match
    if (champion.role.toLowerCase().includes(q)) return true;

    // Notes match
    if (champion.notes && champion.notes.toLowerCase().includes(q)) return true;

    // Items match (primary, secondary, or special)
    const matchesItem = (item: BisItem) =>
      item.name.toLowerCase().includes(q) ||
      item.components.some((c) => c.name.toLowerCase().includes(q)) ||
      (item.grantsTrait !== null && item.grantsTrait.toLowerCase().includes(q));

    if (champion.primary.some(matchesItem)) return true;
    if (champion.secondary.some(matchesItem)) return true;
    if (champion.special.some(matchesItem)) return true;

    return false;
  });
}
