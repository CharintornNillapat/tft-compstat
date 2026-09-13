import { Constants, type Enums } from "@/lib/supabase/types";

/** Game-level constants and types shared by the sync scripts and the UI (client-safe). */

export type TierRank = Enums<"tier_rank">;
export type ItemKind = Enums<"item_kind">;
export type CompStyle = Enums<"comp_style">;

export const TIER_RANKS: readonly TierRank[] = Constants.public.Enums.tier_rank;

export const COMP_STYLE_LABELS = {
  fast8: "Fast 8",
  fast9: "Fast 9",
  reroll_1: "1-cost reroll",
  reroll_2: "2-cost reroll",
  reroll_3: "3-cost reroll",
  flex: "Flex",
} as const satisfies Record<CompStyle, string>;

export const COMP_STYLES: readonly CompStyle[] = Constants.public.Enums.comp_style;

/** `comps.difficulty` 1–3. */
export const DIFFICULTY_LABELS: Record<number, string> = { 1: "Easy", 2: "Medium", 3: "Hard" };

/** The hex board: rows 0 (front) to 3 (back), columns 0–6. */
export const BOARD_ROWS = 4;
export const BOARD_COLS = 7;
export const MAX_UNIT_ITEMS = 3;

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

/** One `traits.effects` entry: the bonus text at `min` units, placeholders resolved. Sorted by `min`. */
export type TraitEffect = { min: number; text: string };

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

/**
 * TFT queues (architecture §4.4). `player_matches.queue_id` stores these, and the
 * dashboard's `StatsFilter` uses them to separate ranked play from everything else.
 *
 * Not to be confused with `RANKED_TFT` in `riot/endpoints.ts` — that's a league
 * entry's `queueType` string, a different axis entirely.
 */
export const QUEUE_IDS = {
  ranked: 1100,
  normal: 1090,
  hyperRoll: 1130,
  doubleUp: 1160,
} as const;

export const QUEUE_LABELS: Record<number, string> = {
  [QUEUE_IDS.ranked]: "Ranked",
  [QUEUE_IDS.normal]: "Normal",
  [QUEUE_IDS.hyperRoll]: "Hyper Roll",
  [QUEUE_IDS.doubleUp]: "Double Up",
};

/** An unknown queue keeps its id rather than being hidden or guessed at. */
export function queueLabel(queueId: number): string {
  return QUEUE_LABELS[queueId] ?? `Queue ${queueId}`;
}

export function isRankedQueue(queueId: number): boolean {
  return queueId === QUEUE_IDS.ranked;
}
