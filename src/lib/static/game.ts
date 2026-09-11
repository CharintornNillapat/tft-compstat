import { Constants, type Enums } from "@/lib/supabase/types";

/** Game-level constants and types shared by the sync scripts and the UI (client-safe). */

export type TierRank = Enums<"tier_rank">;
export type ItemKind = Enums<"item_kind">;

export const TIER_RANKS: readonly TierRank[] = Constants.public.Enums.tier_rank;

export const CHAMPION_COSTS = [1, 2, 3, 4, 5] as const;
export type ChampionCost = (typeof CHAMPION_COSTS)[number];

export function isChampionCost(cost: number): cost is ChampionCost {
  return (CHAMPION_COSTS as readonly number[]).includes(cost);
}

/**
 * Trait activation styles, stored by name in `traits.breakpoints` because each
 * source numbers them differently (CommunityDragon here, Riot's match API in Phase 4).
 */
export const TRAIT_STYLES = ["bronze", "silver", "gold", "prismatic", "unique"] as const;
export type TraitStyle = (typeof TRAIT_STYLES)[number];

/** One `traits.breakpoints` entry: the style reached at `min` units. Sorted by `min`. */
export type TraitBreakpoint = { min: number; style: TraitStyle };

/** Item kinds in the order the item tier list shows them. */
export const ITEM_KIND_LABELS = {
  completed: "Completed",
  artifact: "Artifacts",
  emblem: "Emblems",
  radiant: "Radiant",
  support: "Support",
  component: "Components",
  other: "Other",
} as const satisfies Record<ItemKind, string>;

export const ITEM_KINDS = Object.keys(ITEM_KIND_LABELS) as ItemKind[];
