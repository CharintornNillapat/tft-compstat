import type { TraitBreakpoint, TraitStyle } from "@/lib/static/game";

/**
 * Trait counts for a board (architecture §4.3). Pure and client-safe. Active traits
 * are never stored: they are computed from the champions' traits plus emblems
 * against `traits.breakpoints`, so they can't drift from the static data.
 */

/** Static trait data, keyed by trait api name. */
export type TraitInfo = { name: string; iconUrl: string | null; breakpoints: readonly TraitBreakpoint[] };

export type TraitUnit = {
  /** Champion api name. A champion counts once per trait, even if it's fielded twice. */
  apiName: string;
  /** The champion's own trait api names. */
  traits: readonly string[];
  /** Traits granted by the emblems it holds. One it already has adds nothing. */
  emblemTraits?: readonly string[];
};

export type TraitCount = {
  apiName: string;
  name: string;
  iconUrl: string | null;
  /** Unique champions with the trait. */
  count: number;
  /** Breakpoints reached: 0 when inactive (Riot's match API calls this `tier_current`). */
  level: number;
  /** Style of the highest breakpoint reached; null when inactive. */
  style: TraitStyle | null;
  /** Unit counts at which the trait levels up, lowest first. */
  breakpoints: number[];
};

/** Display order of active styles, as in game: highest first, unique traits after. */
const STYLE_ORDER: Record<TraitStyle, number> = { prismatic: 0, gold: 1, silver: 2, bronze: 3, unique: 4 };

function displayOrder(a: TraitCount, b: TraitCount): number {
  if (a.style && b.style) {
    return STYLE_ORDER[a.style] - STYLE_ORDER[b.style] || b.count - a.count || a.name.localeCompare(b.name);
  }
  if (a.style || b.style) return a.style ? -1 : 1;
  return b.count - a.count || a.name.localeCompare(b.name);
}

export const isActive = (trait: TraitCount) => trait.level > 0;

/**
 * Every trait on the board with its count and reached breakpoint: active traits
 * first (by style, then count), then inactive ones. Traits missing from `traits`
 * are skipped.
 */
export function computeActiveTraits(
  units: readonly TraitUnit[],
  traits: ReadonlyMap<string, TraitInfo>,
): TraitCount[] {
  const traitsByChampion = new Map<string, Set<string>>();
  for (const unit of units) {
    const own = traitsByChampion.get(unit.apiName) ?? new Set<string>();
    for (const trait of [...unit.traits, ...(unit.emblemTraits ?? [])]) own.add(trait);
    traitsByChampion.set(unit.apiName, own);
  }

  const counts = new Map<string, number>();
  for (const own of traitsByChampion.values()) {
    for (const trait of own) counts.set(trait, (counts.get(trait) ?? 0) + 1);
  }

  return [...counts]
    .flatMap(([apiName, count]): TraitCount[] => {
      const info = traits.get(apiName);
      if (!info) return [];
      const reached = info.breakpoints.filter((bp) => bp.min <= count);
      return [
        {
          apiName,
          name: info.name,
          iconUrl: info.iconUrl,
          count,
          level: reached.length,
          style: reached.at(-1)?.style ?? null,
          breakpoints: info.breakpoints.map((bp) => bp.min),
        },
      ];
    })
    .sort(displayOrder);
}
