import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import {
  isTraitKind,
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
import { buildTeamCode, type TeamCode } from "./team-code";
import { buildTraitDetails, parseTraitEffects, pickTraitDetails, type TraitDetailBook } from "./trait-details";
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
  /** Its rating. Carried on the entry so the board can regroup by cost. */
  tier: TierRank;
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

/**
 * `numeric` columns → numbers, with null for anything that isn't one.
 *
 * PostgREST does send these as JSON numbers (checked against the live DB), so this is
 * a guard rather than a fix. The parameter is `unknown` because a `numeric` arriving
 * as a string is a plausible driver change, and the failure it would cause is silent:
 * `("0.564" * 100).toFixed(1)` is fine in JS, but a string that isn't numeric would
 * print "NaN%" on the page instead of throwing anywhere anyone would see it.
 */
function toStats(row: {
  avg_place: unknown;
  top4_rate: unknown;
  pick_rate: unknown;
  level_recommended: unknown;
}): CompStats {
  const num = (value: unknown) => {
    const parsed = typeof value === "string" ? Number(value) : value;
    return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
  };
  return {
    avgPlace: num(row.avg_place),
    top4Rate: num(row.top4_rate),
    pickRate: num(row.pick_rate),
    levelRecommended: num(row.level_recommended),
  };
}

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
              tier,
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
  /** Item priority, 1 first; null when the comp states none. */
  carryPriority: number | null;
  items: CompItem[];
};

/**
 * Curated, author-supplied figures — this site measures nothing global (architecture
 * §0). `top4Rate` and `pickRate` are fractions, like everything in `src/lib/stats`.
 */
export type CompStats = {
  avgPlace: number | null;
  top4Rate: number | null;
  pickRate: number | null;
  levelRecommended: number | null;
};

export type CompSummary = CompStats & {
  slug: string;
  name: string;
  tier: TierRank;
  /** Sleeper pick: low pick rate, high top-4 rate. Curated, not measured. */
  isGem: boolean;
  style: CompStyle;
  difficulty: number | null;
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
  /** Only the guide page shows it, so `/comps` does not ship it to its client list. */
  summary: string | null;
  guide: string | null;
  /** Every trait on the board: active first, then inactive. */
  traits: TraitCount[];
  earlyUnits: CompChampion[];
  flexUnits: CompChampion[];
  /** Tooltip text and members for every trait in `traits`. */
  traitDetails: TraitDetailBook;
  /** The in-client Team Planner import code; null when no unit has a planner id. */
  teamCode: TeamCode | null;
};

// One literal, so supabase-js can infer the row type (the `!inner` join lets the list filter on the set).
const COMP_COLUMNS = `slug, name, tier, style, difficulty, summary, patch, guide_md, updated_at, early_units, flex_units, is_gem, avg_place, top4_rate, pick_rate, level_recommended, set:tft_sets!inner(name, is_active, mutator), units:comp_units(champion_api_name, hex_row, hex_col, star_goal, is_carry, items, carry_priority)`;

async function loadComps(db: Db, filter: { slug: string } | { activeSet: true }) {
  let query = db.from("comps").select(COMP_COLUMNS).eq("is_published", true);
  query = "slug" in filter ? query.eq("slug", filter.slug) : query.eq("set.is_active", true);
  const rows = must(await query.order("tier").order("sort_order").order("name"), "comps");
  if (rows.length === 0) return { comps: [], traitDetails: {} };

  const unique = (values: string[]) => [...new Set(values)];
  const championNames = unique(
    rows.flatMap((row) => [...row.units.map((unit) => unit.champion_api_name), ...row.early_units, ...row.flex_units]),
  );
  const itemNames = unique(rows.flatMap((row) => row.units.flatMap((unit) => unit.items)));
  const [championRows, itemRows] = await Promise.all([
    db.from("champions").select("api_name, name, cost, traits, icon_url, team_planner_code").in("api_name", championNames),
    itemNames.length ? db.from("items").select("api_name, name, icon_url, grants_trait").in("api_name", itemNames) : null,
  ]);
  const champions = new Map(must(championRows, "comp champions").map((row) => [row.api_name, row]));
  const items = new Map((itemRows ? must(itemRows, "comp items") : []).map((row) => [row.api_name, row]));

  const traitNames = unique([
    ...[...champions.values()].flatMap((champion) => champion.traits),
    ...[...items.values()].flatMap((item) => item.grants_trait ?? []),
  ]);
  const [traitResult, memberResult] = await Promise.all([
    db.from("traits").select("api_name, name, icon_url, breakpoints, description, effects, kind").in("api_name", traitNames),
    // Every champion with one of these traits, fielded or not: the tooltip lists the whole trait.
    traitNames.length
      ? db.from("champions").select("api_name, name, cost, icon_url, traits").overlaps("traits", traitNames)
      : null,
  ]);
  const traitRows = must(traitResult, "comp traits");
  // sync-static writes breakpoints in exactly this shape (architecture §4.8).
  const breakpointsOf = (row: (typeof traitRows)[number]) => row.breakpoints as TraitBreakpoint[];
  const traits = new Map<string, TraitInfo>(
    traitRows.map((row) => [row.api_name, { name: row.name, iconUrl: row.icon_url, breakpoints: breakpointsOf(row) }]),
  );
  const traitDetails = buildTraitDetails({
    traits: traitRows.map((row) => ({
      apiName: row.api_name,
      breakpoints: breakpointsOf(row),
      description: row.description,
      effects: parseTraitEffects(row.effects),
      // A check constraint, not an enum, so the generated type is plain `string`.
      kind: isTraitKind(row.kind) ? row.kind : null,
    })),
    champions: (memberResult ? must(memberResult, "trait members") : []).map((row) => ({
      apiName: row.api_name,
      name: row.name,
      cost: row.cost,
      iconUrl: row.icon_url,
      traits: row.traits,
    })),
  });

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

  const comps = rows.map((row) => {
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
            carryPriority: unit.carry_priority,
            items: unit.items.map((apiName) => {
              const item = items.get(apiName);
              return { apiName, name: item?.name ?? apiName, iconUrl: item?.icon_url ?? null };
            }),
          },
        ];
      })
      // Stated item priority wins over the cost fallback: "1st" should read first.
      .sort(
        (a, b) =>
          Number(b.isCarry) - Number(a.isCarry) ||
          (a.carryPriority ?? Infinity) - (b.carryPriority ?? Infinity) ||
          b.cost - a.cost ||
          a.name.localeCompare(b.name),
      );

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
        patch: row.patch,
        updatedAt: row.updated_at,
        isGem: row.is_gem,
        ...toStats(row),
        units,
        traits: boardTraits.filter(isActive),
      } satisfies CompSummary,
      detail: {
        setName: row.set.name,
        summary: row.summary,
        guide: row.guide_md,
        traits: boardTraits,
        earlyUnits: toChampions(row.early_units),
        flexUnits: toChampions(row.flex_units),
        // Built from the sorted units, so the carries lead the planner too.
        teamCode: buildTeamCode(
          units.map((unit) => ({
            apiName: unit.apiName,
            name: unit.name,
            plannerCode: champions.get(unit.apiName)?.team_planner_code ?? null,
          })),
          row.set.mutator,
        ),
      },
    };
  });
  return { comps, traitDetails };
}

/**
 * Published comps of the active set: by tier, then the YAML `order`, then name. Trait
 * details cover only the active traits the rows show, so nothing unused is shipped.
 */
export async function getComps(): Promise<{
  setName: string | null;
  comps: CompSummary[];
  traitDetails: TraitDetailBook;
}> {
  "use cache";
  cacheTag("comps", "static");
  cacheLife("days");

  const { comps, traitDetails } = await loadComps(getSupabase(), { activeSet: true });
  const summaries = comps.map((comp) => comp.summary);
  return {
    setName: comps[0]?.detail.setName ?? null,
    comps: summaries,
    traitDetails: pickTraitDetails(
      traitDetails,
      summaries.flatMap((comp) => comp.traits.map((trait) => trait.apiName)),
    ),
  };
}

/** One published comp with its guide, or null. */
export async function getComp(slug: string): Promise<CompDetail | null> {
  "use cache";
  cacheTag("comps", "static");
  cacheLife("days");

  const {
    comps: [comp],
    traitDetails,
  } = await loadComps(getSupabase(), { slug });
  if (!comp) return null;
  return {
    ...comp.summary,
    ...comp.detail,
    traitDetails: pickTraitDetails(traitDetails, comp.detail.traits.map((trait) => trait.apiName)),
  };
}

/** Slugs of every published comp, for prerendering `/comps/[slug]`. */
export async function getCompSlugs(): Promise<string[]> {
  "use cache";
  cacheTag("comps");
  cacheLife("days");

  const rows = must(await getSupabase().from("comps").select("slug").eq("is_published", true), "comp slugs");
  return rows.map((row) => row.slug);
}
