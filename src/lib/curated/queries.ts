import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { ITEM_KINDS, TIER_RANKS, type ItemKind, type TierRank } from "@/lib/static/game";
import { must } from "@/lib/supabase/result";
import { getSupabase } from "@/lib/supabase/server";
import type { TierListKind } from "./schemas";

/**
 * Cached reads for the tier list pages (architecture §8). They prerender into the
 * static shell; `scripts/seed-curated.ts` and `sync-static.ts` revalidate the tags.
 * `cacheLife("days")` is only a safety net for a missed revalidation.
 */

export type TierListMeta = {
  title: string;
  patch: string;
  summary: string | null;
  /** ISO timestamp of the last seed. */
  updatedAt: string;
  setName: string | null;
};

export type TierGroup<T> = { tier: TierRank; entries: T[] };

export type ChampionTierEntry = {
  apiName: string;
  name: string;
  cost: number;
  iconUrl: string | null;
  /** Trait display names. */
  traits: string[];
  note: string | null;
};

export type ChampionTierList = TierListMeta & { tiers: TierGroup<ChampionTierEntry>[] };

export type ItemRef = { name: string; iconUrl: string | null };

export type ItemTierEntry = {
  apiName: string;
  name: string;
  kind: ItemKind;
  iconUrl: string | null;
  /** Recipe, when the item is crafted. */
  components: ItemRef[];
  /** Trait name, for emblems. */
  grantsTrait: string | null;
  note: string | null;
};

/** Only kinds and tiers that have entries, in display order. */
export type ItemTierList = TierListMeta & { groups: { kind: ItemKind; tiers: TierGroup<ItemTierEntry>[] }[] };

type Db = ReturnType<typeof getSupabase>;

async function loadCurrentList(db: Db, kind: TierListKind) {
  const list = must(
    await db
      .from("tier_lists")
      .select("id, title, patch, notes, updated_at, set:tft_sets(name)")
      .eq("kind", kind)
      .eq("is_current", true)
      .maybeSingle(),
    `current ${kind} tier list`,
  );
  if (!list) return null;
  const meta: TierListMeta = {
    title: list.title,
    patch: list.patch,
    summary: list.notes,
    updatedAt: list.updated_at,
    setName: list.set?.name ?? null,
  };
  return { id: list.id, meta };
}

async function namesByApiName(db: Db, table: "traits" | "items", apiNames: string[]) {
  if (apiNames.length === 0) return new Map<string, { name: string; icon_url: string | null }>();
  const rows = must(
    await db.from(table).select("api_name, name, icon_url").in("api_name", [...new Set(apiNames)]),
    table,
  );
  return new Map(rows.map((row) => [row.api_name, row]));
}

function groupByTier<T>(rows: { tier: TierRank; entry: T }[]): TierGroup<T>[] {
  return TIER_RANKS.map((tier) => ({
    tier,
    entries: rows.filter((row) => row.tier === tier).map((row) => row.entry),
  }));
}

export async function getChampionTierList(): Promise<ChampionTierList | null> {
  "use cache";
  cacheTag("tiers", "static");
  cacheLife("days");

  const db = getSupabase();
  const list = await loadCurrentList(db, "champion");
  if (!list) return null;

  const rows = must(
    await db
      .from("tier_entries")
      .select("tier, note, champion:champions(api_name, name, cost, traits, icon_url)")
      .eq("tier_list_id", list.id)
      .order("tier")
      .order("position"),
    "champion tier entries",
  );
  const traits = await namesByApiName(db, "traits", rows.flatMap((row) => row.champion?.traits ?? []));

  const entries = rows.flatMap(({ tier, note, champion }) =>
    champion
      ? [
          {
            tier,
            entry: {
              apiName: champion.api_name,
              name: champion.name,
              cost: champion.cost,
              iconUrl: champion.icon_url,
              traits: champion.traits.map((apiName) => traits.get(apiName)?.name ?? apiName),
              note,
            },
          },
        ]
      : [],
  );
  return { ...list.meta, tiers: groupByTier(entries) };
}

export async function getItemTierList(): Promise<ItemTierList | null> {
  "use cache";
  cacheTag("tiers", "static");
  cacheLife("days");

  const db = getSupabase();
  const list = await loadCurrentList(db, "item");
  if (!list) return null;

  const rows = must(
    await db
      .from("tier_entries")
      .select("tier, note, item:items(api_name, name, kind, components, grants_trait, icon_url)")
      .eq("tier_list_id", list.id)
      .order("tier")
      .order("position"),
    "item tier entries",
  );
  const [components, traits] = await Promise.all([
    namesByApiName(db, "items", rows.flatMap((row) => row.item?.components ?? [])),
    namesByApiName(db, "traits", rows.flatMap((row) => (row.item?.grants_trait ? [row.item.grants_trait] : []))),
  ]);

  const entries = rows.flatMap(({ tier, note, item }) =>
    item
      ? [
          {
            tier,
            entry: {
              apiName: item.api_name,
              name: item.name,
              kind: item.kind,
              iconUrl: item.icon_url,
              components: item.components.map((apiName) => {
                const component = components.get(apiName);
                return { name: component?.name ?? apiName, iconUrl: component?.icon_url ?? null };
              }),
              grantsTrait: item.grants_trait ? (traits.get(item.grants_trait)?.name ?? item.grants_trait) : null,
              note,
            },
          },
        ]
      : [],
  );

  const groups = ITEM_KINDS.map((kind) => ({
    kind,
    tiers: groupByTier(entries.filter(({ entry }) => entry.kind === kind)).filter((t) => t.entries.length > 0),
  })).filter((group) => group.tiers.length > 0);
  return { ...list.meta, groups };
}
