import type { AugmentRarity, TierRank } from "@/lib/static/game";
import type { Augment } from "./augment-tiers";

export type AugmentFilterOptions = {
  tiers?: ReadonlySet<TierRank>;
  rarities?: ReadonlySet<AugmentRarity>;
  query?: string;
};

/**
 * Pure filtering for augments on `/augments`.
 *
 * Matches:
 * - Tier rank (S, A, B, C)
 * - Rarity (Silver, Gold, Prismatic)
 * - Search query against augment name, description (effects), or rarity.
 */
export function filterAugments(
  augments: readonly Augment[],
  options: AugmentFilterOptions,
): Augment[] {
  const { tiers, rarities, query } = options;
  const q = query?.trim().toLowerCase();

  return augments.filter((augment) => {
    if (tiers && tiers.size > 0 && !tiers.has(augment.tier)) {
      return false;
    }
    if (rarities && rarities.size > 0 && !rarities.has(augment.rarity)) {
      return false;
    }
    if (!q) return true;

    // Augment name match
    if (augment.name.toLowerCase().includes(q)) return true;

    // Augment description match (e.g. "attack speed", "gold", "reroll")
    if (augment.description && augment.description.toLowerCase().includes(q)) return true;

    // Rarity match (e.g. "silver", "prismatic")
    if (augment.rarity.toLowerCase().includes(q)) return true;

    return false;
  });
}
