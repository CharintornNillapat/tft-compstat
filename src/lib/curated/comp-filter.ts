import { COMP_STYLE_LABELS, type CompStyle, type TierRank } from "@/lib/static/game";

/** The /comps filters (client-safe). Empty sets mean "any". */
export type CompFilter = {
  tiers: ReadonlySet<TierRank>;
  styles: ReadonlySet<CompStyle>;
  query: string;
};

type FilterableComp = {
  name: string;
  tier: TierRank;
  style: CompStyle;
  units: readonly { name: string; items: readonly { name: string }[] }[];
  traits: readonly { name: string }[];
};

/** Lowercase letters and digits only, so "kha'zix" finds Kha'Zix and "fast9" finds Fast 9. */
const normalize = (text: string) =>
  text
    .normalize("NFD")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/**
 * Comps matching the tier and style filters and every word of the query. A word
 * matches the comp's name, style, unit names, item names or active trait names.
 */
export function filterComps<T extends FilterableComp>(comps: readonly T[], filter: CompFilter): T[] {
  const words = filter.query.split(/\s+/).map(normalize).filter(Boolean);
  return comps.filter((comp) => {
    if (filter.tiers.size > 0 && !filter.tiers.has(comp.tier)) return false;
    if (filter.styles.size > 0 && !filter.styles.has(comp.style)) return false;
    if (words.length === 0) return true;
    const haystack = [
      comp.name,
      COMP_STYLE_LABELS[comp.style],
      ...comp.units.flatMap((unit) => [unit.name, ...unit.items.map((item) => item.name)]),
      ...comp.traits.map((trait) => trait.name),
    ].map(normalize);
    return words.every((word) => haystack.some((text) => text.includes(word)));
  });
}
