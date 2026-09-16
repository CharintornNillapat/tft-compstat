import type { TierRank } from "@/lib/static/game";

export type CompSortKey = "tier" | "avg" | "top4" | "pick";
export type SortDirection = "asc" | "desc";

export type SortableComp = {
  name: string;
  tier: TierRank;
  sortOrder?: number;
  avgPlace?: number | null;
  top4Rate?: number | null;
  pickRate?: number | null;
};

/** Default natural directions for each sort metric. */
export const DEFAULT_SORT_DIRECTIONS: Record<CompSortKey, SortDirection> = {
  tier: "asc", // S -> A -> B -> C
  avg: "asc", // 3.90 -> 4.05 -> 4.50 (lowest avg placement first)
  top4: "desc", // 65% -> 55% -> 45% (highest top-4 rate first)
  pick: "desc", // 15% -> 10% -> 1% (highest pick rate first)
};

const TIER_ORDER: Record<TierRank, number> = { S: 0, A: 1, B: 2, C: 3 };

/**
 * Pure: sorts comps by tier, avg placement, top-4 rate, or pick rate.
 *
 * For stat-based sorts (avg, top4, pick), comps with recorded stats always
 * precede comps with null/missing stats regardless of sort direction.
 * Ties are broken deterministically by tier order, sortOrder, then name.
 */
export function sortComps<T extends SortableComp>(
  comps: readonly T[],
  key: CompSortKey,
  direction: SortDirection = DEFAULT_SORT_DIRECTIONS[key],
): T[] {
  return [...comps].sort((a, b) => {
    if (key === "tier") {
      const tierDiff = (TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9);
      if (tierDiff !== 0) return direction === "asc" ? tierDiff : -tierDiff;
      const orderDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      if (orderDiff !== 0) return orderDiff;
      return a.name.localeCompare(b.name);
    }

    if (key === "avg") {
      const aVal = a.avgPlace;
      const bVal = b.avgPlace;
      if (aVal != null && bVal == null) return -1;
      if (aVal == null && bVal != null) return 1;
      if (aVal != null && bVal != null && aVal !== bVal) {
        return direction === "asc" ? aVal - bVal : bVal - aVal;
      }
      const tierDiff = (TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9);
      if (tierDiff !== 0) return tierDiff;
      return a.name.localeCompare(b.name);
    }

    if (key === "top4") {
      const aVal = a.top4Rate;
      const bVal = b.top4Rate;
      if (aVal != null && bVal == null) return -1;
      if (aVal == null && bVal != null) return 1;
      if (aVal != null && bVal != null && aVal !== bVal) {
        return direction === "desc" ? bVal - aVal : aVal - bVal;
      }
      const tierDiff = (TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9);
      if (tierDiff !== 0) return tierDiff;
      return a.name.localeCompare(b.name);
    }

    if (key === "pick") {
      const aVal = a.pickRate;
      const bVal = b.pickRate;
      if (aVal != null && bVal == null) return -1;
      if (aVal == null && bVal != null) return 1;
      if (aVal != null && bVal != null && aVal !== bVal) {
        return direction === "desc" ? bVal - aVal : aVal - bVal;
      }
      const tierDiff = (TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9);
      if (tierDiff !== 0) return tierDiff;
      return a.name.localeCompare(b.name);
    }

    return 0;
  });
}
