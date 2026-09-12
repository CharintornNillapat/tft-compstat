import { CHAMPION_COSTS, type TierRank } from "@/lib/static/game";

/**
 * Regrouping for the champion tier list's cost view (architecture §9). Pure and
 * client-safe, like `comp-filter.ts`, so it is unit-testable without a DOM.
 */

type Entry = { cost: number };
type TierGroup<T> = { tier: TierRank; entries: T[] };

export type CostGroup<T> = { cost: number; entries: T[] };

/**
 * Tier groups → one row per cost, strongest first within each row.
 *
 * The ordering is inherited rather than computed: `getChampionTierList()` returns the
 * tiers S→C with each tier in its YAML `position` order, so flattening them and
 * bucketing by cost **stably** leaves every row sorted by tier and then by the
 * author's own ranking inside that tier. That is why there is no comparator here —
 * re-sorting would throw away the hand-written order within a tier.
 *
 * Costs are emitted 1→5 whether or not they have entries, so an empty row still shows
 * that nothing of that cost is rated. A cost outside 1-5 gets its own trailing row
 * rather than being dropped: the schema should prevent it, but losing a champion
 * silently is a worse failure than an odd-looking extra row.
 */
export function groupChampionsByCost<T extends Entry>(tiers: readonly TierGroup<T>[]): CostGroup<T>[] {
  const byCost = new Map<number, T[]>(CHAMPION_COSTS.map((cost) => [cost, []]));
  for (const { entries } of tiers) {
    for (const entry of entries) {
      const bucket = byCost.get(entry.cost);
      if (bucket) bucket.push(entry);
      else byCost.set(entry.cost, [entry]);
    }
  }
  return [...byCost].sort(([a], [b]) => a - b).map(([cost, entries]) => ({ cost, entries }));
}
