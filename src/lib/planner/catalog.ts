import type { ItemKind } from "@/lib/static/game";
import { normalize } from "@/lib/curated/comp-filter";
import type { TraitDetailBook } from "@/lib/curated/trait-details";
import type { TraitInfo } from "@/lib/curated/traits";
import {
  PLANNER_ITEM_KINDS,
  type PlannerCatalog,
  type PlannerChampion,
  type PlannerItem,
  type PlannerItemKind,
} from "./board";

/**
 * The planner's pickers (architecture §9, Phase 6 Task 16): which items are offered,
 * and the champion and item filters. Pure and client-safe.
 */

/** What `/planner` receives from `getPlannerData()` (server), declared here so client code can import it. */
export type PlannerData = {
  set: { id: number; name: string; mutator: string };
  catalog: PlannerCatalog;
  /** `TraitInfo` by api name; the client turns it into the Map `computeActiveTraits` takes. */
  traits: Record<string, TraitInfo>;
  traitDetails: TraitDetailBook;
};

/**
 * Tile captions. A name shared by several forms (Set 18's Lux elements) gets the trait
 * that tells that form apart, so ten tiles do not all read "Lux".
 */
export function championLabels(
  champions: readonly PlannerChampion[],
  traitNames: Record<string, string>,
): Record<string, string> {
  const byName = new Map<string, PlannerChampion[]>();
  for (const champion of champions) byName.set(champion.name, [...(byName.get(champion.name) ?? []), champion]);
  const labels: Record<string, string> = {};
  for (const [name, forms] of byName) {
    for (const form of forms) {
      const shared = (trait: string) => forms.every((other) => other.traits.includes(trait));
      const own = forms.length > 1 ? form.traits.find((trait) => !shared(trait)) : undefined;
      labels[form.apiName] = own ? `${name} · ${traitNames[own] ?? own}` : name;
    }
  }
  return labels;
}

export type ItemRow = {
  api_name: string;
  name: string;
  icon_url: string | null;
  kind: ItemKind;
  grants_trait: string | null;
};

/**
 * Augment mechanics the item tables file under "artifact": Artifactinate is an augment
 * that hands out artifacts, not an item a unit can hold.
 */
const NOT_HOLDABLE = /^DA_Artifactinate/;

const isPlannerKind = (kind: ItemKind): kind is PlannerItemKind => (PLANNER_ITEM_KINDS as readonly string[]).includes(kind);

/**
 * Completed items, emblems and artifacts a unit can hold. Only `DA_` items: Set 18 also
 * lists the older `TFT_Item_…` versions, which match data never uses (§4.8, §6.1). Two
 * rows with the same kind and name are one choice — the Flora Fatalis emblem an augment
 * grants duplicates the craftable one — so the shorter api name wins.
 */
export function plannerItemPool(rows: readonly ItemRow[]): PlannerItem[] {
  const byName = new Map<string, ItemRow & { kind: PlannerItemKind }>();
  for (const row of rows) {
    if (!row.api_name.startsWith("DA_") || NOT_HOLDABLE.test(row.api_name) || !isPlannerKind(row.kind)) continue;
    const key = `${row.kind}|${row.name}`;
    const kept = byName.get(key);
    if (!kept || row.api_name.length < kept.api_name.length) byName.set(key, { ...row, kind: row.kind });
  }
  const kindOrder = (kind: PlannerItemKind) => PLANNER_ITEM_KINDS.indexOf(kind);
  return [...byName.values()]
    .map((row) => ({ apiName: row.api_name, name: row.name, iconUrl: row.icon_url, kind: row.kind, grantsTrait: row.grants_trait }))
    .sort((a, b) => kindOrder(a.kind) - kindOrder(b.kind) || a.name.localeCompare(b.name) || a.apiName.localeCompare(b.apiName));
}

/** Champion picker filters. Empty sets mean "any"; a unit matches a trait filter if it has any selected trait. */
export type ChampionFilter = { costs: ReadonlySet<number>; traits: ReadonlySet<string>; query: string };

const words = (query: string) => query.split(/\s+/).map(normalize).filter(Boolean);

/** Cheapest first, then by name — the shop's order. Every query word must match a name or a trait. */
export function filterChampions(
  champions: readonly PlannerChampion[],
  filter: ChampionFilter,
  traitNames: Record<string, string>,
): PlannerChampion[] {
  const terms = words(filter.query);
  return champions
    .filter((champion) => {
      if (filter.costs.size > 0 && !filter.costs.has(champion.cost)) return false;
      if (filter.traits.size > 0 && !champion.traits.some((trait) => filter.traits.has(trait))) return false;
      if (terms.length === 0) return true;
      const haystack = [champion.name, ...champion.traits.map((trait) => traitNames[trait] ?? trait)].map(normalize);
      return terms.every((term) => haystack.some((text) => text.includes(term)));
    })
    .sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name) || a.apiName.localeCompare(b.apiName));
}

/** Item picker: one kind (or all) and a query over the item's name and the trait an emblem grants. */
export function filterItems(
  items: readonly PlannerItem[],
  kind: PlannerItemKind | "all",
  query: string,
  traitNames: Record<string, string>,
): PlannerItem[] {
  const terms = words(query);
  return items.filter((item) => {
    if (kind !== "all" && item.kind !== kind) return false;
    if (terms.length === 0) return true;
    const haystack = [item.name, item.grantsTrait ? (traitNames[item.grantsTrait] ?? "") : ""].map(normalize);
    return terms.every((term) => haystack.some((text) => text.includes(term)));
  });
}

/** Trait filter options: only traits some champion has, by name. */
export function traitOptions(
  champions: readonly PlannerChampion[],
  traitNames: Record<string, string>,
): { value: string; label: string }[] {
  const used = new Set(champions.flatMap((champion) => champion.traits));
  return [...used]
    .map((apiName) => ({ value: apiName, label: traitNames[apiName] ?? apiName }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
