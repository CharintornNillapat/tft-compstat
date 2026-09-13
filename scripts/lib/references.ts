import type { ReferenceIndex } from "@/lib/curated/validate";
import type { ItemKind } from "@/lib/static/game";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { selectAll } from "./db";

/**
 * The static tables every curated script checks `api_name`s against
 * (architecture §7 step 3). One read, shared by `seed-curated` and `sync-meta`.
 */
export type References = {
  /** Sets that have static data; a curated folder for any other set can't be checked. */
  setIds: Set<number>;
  index: ReferenceIndex;
  /**
   * Champions buyable from the shop: every playable unit `sync:static` stores, Riftbeasts
   * included (architecture §4.8). The tier list and BIS rate these and nothing else.
   */
  shopUnits: Set<string>;
  /**
   * Item kind by `api_name`. `ReferenceIndex` answers "does this name exist";
   * this answers "is it the sort of item a tier list rates".
   */
  itemKinds: Map<string, ItemKind>;
  /** Shop cost by `api_name`. `sync-meta` needs it to tell a reroll comp from a fast 8. */
  costs: Map<string, number>;
  /** Recipe by item `api_name`. `sync-bis` reads a build's role off its components. */
  components: Map<string, string[]>;
  /** Game-data version by set id, for a generated file that has no patch of its own. */
  setPatches: Map<number, string>;
};

export async function loadReferences(): Promise<References> {
  const db = getSupabaseAdmin();
  const [sets, champions, items, traits] = await Promise.all([
    selectAll((from, to) => db.from("tft_sets").select("id, patch").order("id").range(from, to), "tft_sets"),
    selectAll(
      (from, to) =>
        db
          .from("champions")
          .select("api_name, name, set_id, traits, is_shop_unit, cost")
          .order("api_name")
          .range(from, to),
      "champions",
    ),
    selectAll(
      (from, to) =>
        db.from("items").select("api_name, name, grants_trait, kind, components").order("api_name").range(from, to),
      "items",
    ),
    selectAll((from, to) => db.from("traits").select("api_name, name").order("api_name").range(from, to), "traits"),
  ]);

  const index: ReferenceIndex = {
    champions: new Map(champions.map((c) => [c.api_name, { name: c.name, setId: c.set_id, traits: c.traits }])),
    items: new Map(items.map((i) => [i.api_name, { name: i.name, grantsTrait: i.grants_trait }])),
    traits: new Map(traits.map((t) => [t.api_name, { name: t.name }])),
  };
  return {
    setIds: new Set(sets.map((s) => s.id)),
    index,
    shopUnits: new Set(champions.filter((c) => c.is_shop_unit).map((c) => c.api_name)),
    itemKinds: new Map(items.map((i) => [i.api_name, i.kind])),
    costs: new Map(champions.map((c) => [c.api_name, c.cost])),
    components: new Map(items.map((i) => [i.api_name, i.components])),
    setPatches: new Map(sets.flatMap((s) => (s.patch ? [[s.id, s.patch] as const] : []))),
  };
}
