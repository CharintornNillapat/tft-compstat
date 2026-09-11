import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import {
  ITEM_KINDS,
  TIER_RANKS,
  type CompStyle,
  type ItemKind,
  type TierRank,
  type TraitBreakpoint,
} from "@/lib/static/game";
import { must } from "@/lib/supabase/result";
import { getSupabase } from "@/lib/supabase/server";
import type { TierListKind } from "./schemas";
import { computeActiveTraits, isActive, type TraitCount, type TraitInfo } from "./traits";

/**
 * Cached reads for the tier list and comp pages (architecture §8). They prerender
 * into the static shell; `scripts/seed-curated.ts` and `sync-static.ts` revalidate
 * the tags. `cacheLife("days")` is only a safety net for a missed revalidation.
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

// ─── Comps ──────────────────────────────────────────────────────────────────

export type CompChampion = {
  apiName: string;
  name: string;
  cost: number;
  iconUrl: string | null;
  /** Trait display names. */
  traits: string[];
};

export type CompItem = { apiName: string; name: string; iconUrl: string | null };

export type CompUnit = CompChampion & {
  /** 0 (front) to 3 (back). */
  row: number;
  col: number;
  star: number;
  isCarry: boolean;
  items: CompItem[];
};

export type CompSummary = {
  slug: string;
  name: string;
  tier: TierRank;
  style: CompStyle;
  difficulty: number | null;
  summary: string | null;
  patch: string;
  /** ISO timestamp of the last seed. */
  updatedAt: string;
  /** Board units: carries first, then by cost (high first) and name. */
  units: CompUnit[];
  /** Active traits only, in display order. */
  traits: TraitCount[];
};

export type CompDetail = Omit<CompSummary, "traits"> & {
  setName: string | null;
  guide: string | null;
  /** Every trait on the board: active first, then inactive. */
  traits: TraitCount[];
  earlyUnits: CompChampion[];
  flexUnits: CompChampion[];
};

// One literal, so supabase-js can infer the row type (the `!inner` join lets the list filter on the set).
const COMP_COLUMNS = `slug, name, tier, style, difficulty, summary, patch, guide_md, updated_at, early_units, flex_units, set:tft_sets!inner(name, is_active), units:comp_units(champion_api_name, hex_row, hex_col, star_goal, is_carry, items)`;

async function loadComps(db: Db, filter: { slug: string } | { activeSet: true }) {
  let query = db.from("comps").select(COMP_COLUMNS).eq("is_published", true);
  query = "slug" in filter ? query.eq("slug", filter.slug) : query.eq("set.is_active", true);
  const rows = must(await query.order("tier").order("sort_order").order("name"), "comps");
  if (rows.length === 0) return [];

  const unique = (values: string[]) => [...new Set(values)];
  const championNames = unique(
    rows.flatMap((row) => [...row.units.map((unit) => unit.champion_api_name), ...row.early_units, ...row.flex_units]),
  );
  const itemNames = unique(rows.flatMap((row) => row.units.flatMap((unit) => unit.items)));
  const [championRows, itemRows] = await Promise.all([
    db.from("champions").select("api_name, name, cost, traits, icon_url").in("api_name", championNames),
    itemNames.length ? db.from("items").select("api_name, name, icon_url, grants_trait").in("api_name", itemNames) : null,
  ]);
  const champions = new Map(must(championRows, "comp champions").map((row) => [row.api_name, row]));
  const items = new Map((itemRows ? must(itemRows, "comp items") : []).map((row) => [row.api_name, row]));

  const traitNames = unique([
    ...[...champions.values()].flatMap((champion) => champion.traits),
    ...[...items.values()].flatMap((item) => item.grants_trait ?? []),
  ]);
  const traitRows = must(
    await db.from("traits").select("api_name, name, icon_url, breakpoints").in("api_name", traitNames),
    "comp traits",
  );
  const traits = new Map<string, TraitInfo>(
    traitRows.map((row) => [
      row.api_name,
      // sync-static writes breakpoints in exactly this shape (architecture §4.8).
      { name: row.name, iconUrl: row.icon_url, breakpoints: row.breakpoints as TraitBreakpoint[] },
    ]),
  );

  const toChampion = (apiName: string): CompChampion | undefined => {
    const champion = champions.get(apiName);
    if (!champion) return undefined;
    return {
      apiName,
      name: champion.name,
      cost: champion.cost,
      iconUrl: champion.icon_url,
      traits: champion.traits.map((trait) => traits.get(trait)?.name ?? trait),
    };
  };
  const toChampions = (apiNames: string[]) => apiNames.flatMap((apiName) => toChampion(apiName) ?? []);

  return rows.map((row) => {
    const units = row.units
      .flatMap((unit): CompUnit[] => {
        const champion = toChampion(unit.champion_api_name);
        if (!champion) return [];
        return [
          {
            ...champion,
            row: unit.hex_row,
            col: unit.hex_col,
            star: unit.star_goal,
            isCarry: unit.is_carry,
            items: unit.items.map((apiName) => {
              const item = items.get(apiName);
              return { apiName, name: item?.name ?? apiName, iconUrl: item?.icon_url ?? null };
            }),
          },
        ];
      })
      .sort((a, b) => Number(b.isCarry) - Number(a.isCarry) || b.cost - a.cost || a.name.localeCompare(b.name));

    const boardTraits = computeActiveTraits(
      row.units.map((unit) => ({
        apiName: unit.champion_api_name,
        traits: champions.get(unit.champion_api_name)?.traits ?? [],
        emblemTraits: unit.items.flatMap((apiName) => items.get(apiName)?.grants_trait ?? []),
      })),
      traits,
    );

    return {
      summary: {
        slug: row.slug,
        name: row.name,
        tier: row.tier,
        style: row.style,
        difficulty: row.difficulty,
        summary: row.summary,
        patch: row.patch,
        updatedAt: row.updated_at,
        units,
        traits: boardTraits.filter(isActive),
      } satisfies CompSummary,
      detail: {
        setName: row.set.name,
        guide: row.guide_md,
        traits: boardTraits,
        earlyUnits: toChampions(row.early_units),
        flexUnits: toChampions(row.flex_units),
      },
    };
  });
}

/** Published comps of the active set: by tier, then the YAML `order`, then name. */
export async function getComps(): Promise<{ setName: string | null; comps: CompSummary[] }> {
  "use cache";
  cacheTag("comps", "static");
  cacheLife("days");

  const comps = await loadComps(getSupabase(), { activeSet: true });
  return { setName: comps[0]?.detail.setName ?? null, comps: comps.map((comp) => comp.summary) };
}

/** One published comp with its guide, or null. */
export async function getComp(slug: string): Promise<CompDetail | null> {
  "use cache";
  cacheTag("comps", "static");
  cacheLife("days");

  const [comp] = await loadComps(getSupabase(), { slug });
  return comp ? { ...comp.summary, ...comp.detail } : null;
}

/** Slugs of every published comp, for prerendering `/comps/[slug]`. */
export async function getCompSlugs(): Promise<string[]> {
  "use cache";
  cacheTag("comps");
  cacheLife("days");

  const rows = must(await getSupabase().from("comps").select("slug").eq("is_published", true), "comp slugs");
  return rows.map((row) => row.slug);
}
