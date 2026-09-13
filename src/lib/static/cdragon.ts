import { z } from "zod";
import type { TablesInsert } from "@/lib/supabase/types";
import type { ItemKind, TraitBreakpoint, TraitEffect, TraitKind, TraitStyle } from "./game";
import { traitText } from "./trait-text";

/**
 * CommunityDragon TFT data → static reference rows (architecture §4.2).
 * Pure: `scripts/sync-static.ts` fetches and writes; this module only transforms.
 */

export const CDRAGON_ORIGIN = "https://raw.communitydragon.org";

// ─── Versions & asset URLs ──────────────────────────────────────────────────

/**
 * `16.18.8165012+branch…` → `16.18`. This is the game-client data version, which
 * CommunityDragon also uses as a directory name. It is not TFT's per-set patch
 * label (e.g. "18.1"); curated YAML carries that one.
 */
export function cdragonPatch(version: string): string {
  const match = /^(\d+)\.(\d+)\./.exec(version);
  if (!match) throw new Error(`Unrecognized CommunityDragon version "${version}"`);
  return `${match[1]}.${match[2]}`;
}

/**
 * Asset path from the TFT JSON (`assets/…/icon.tex`, any case) → PNG URL pinned to
 * a patch directory. CommunityDragon keeps old patch directories, so a stored URL
 * keeps pointing at the file that existed when the data was synced.
 */
export function cdragonAssetUrl(assetPath: string | null | undefined, patch: string): string | null {
  if (!assetPath) return null;
  const path = assetPath.toLowerCase().replace(/^\/+/, "").replace(/\.(tex|dds)$/, ".png");
  return `${CDRAGON_ORIGIN}/${patch}/game/${path}`;
}

// ─── Source schemas (only the fields we use) ────────────────────────────────

const traitSchema = z.object({
  apiName: z.string(),
  name: z.string(),
  /** Client markup with @Variable@ placeholders; `trait-text.ts` turns it into plain text. */
  desc: z.string().nullish(),
  icon: z.string().nullish(),
  effects: z.array(
    z.object({
      minUnits: z.number().nullable(),
      style: z.number().nullable(),
      variables: z.record(z.string(), z.unknown()).nullish(),
    }),
  ),
});

const championSchema = z.object({
  apiName: z.string(),
  name: z.string(),
  cost: z.number(),
  traits: z.array(z.string()), // display names, not api names
  tileIcon: z.string().nullish(),
  squareIcon: z.string().nullish(),
  icon: z.string().nullish(),
});

const setSchema = z.object({
  number: z.number(),
  mutator: z.string(),
  name: z.string(),
  champions: z.array(championSchema),
  traits: z.array(traitSchema),
  items: z.array(z.string()).default([]),
});

const itemSchema = z.object({
  apiName: z.string(),
  name: z.string().nullish(),
  icon: z.string().nullish(),
  composition: z.array(z.string()).nullish(),
  tags: z.array(z.string()).nullish(),
});

// The file holds every set and mode variant; only the chosen set is parsed strictly,
// so a format quirk in some old mode can't break the sync.
const rootSchema = z.object({
  items: z.array(z.looseObject({ apiName: z.string() })),
  setData: z.array(z.looseObject({ number: z.number(), mutator: z.string() })),
});

export type CdragonTft = z.infer<typeof rootSchema>;
type CdragonSet = z.infer<typeof setSchema>;
type CdragonItem = z.infer<typeof itemSchema>;

function parseOrThrow<T extends z.ZodType>(schema: T, value: unknown, what: string): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(`Unexpected CommunityDragon format (${what}):\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

export const parseCdragonTft = (value: unknown) => parseOrThrow(rootSchema, value, "en_us.json");

// ─── Sets ───────────────────────────────────────────────────────────────────

/** Main-queue sets use `TFTSet<N>`; `_PAIRS`, `_TURBO`, `_PVEMODE`, events etc. are modes. */
function isStandardSet(set: { number: number; mutator: string }) {
  return set.mutator === `TFTSet${set.number}`;
}

/** The requested set, or the newest standard set in the data. */
export function pickSet(data: CdragonTft, setNumber?: number): CdragonSet {
  const standard = data.setData.filter(isStandardSet);
  const chosen =
    setNumber === undefined
      ? standard.reduce<(typeof standard)[number] | undefined>(
          (best, set) => (!best || set.number > best.number ? set : best),
          undefined,
        )
      : standard.find((set) => set.number === setNumber);
  if (!chosen) {
    const available = standard.map((set) => set.number).sort((a, b) => a - b);
    throw new Error(
      `Set ${setNumber ?? "(newest)"} not found. Standard sets in the data: ${available.join(", ")}`,
    );
  }
  return parseOrThrow(setSchema, chosen, chosen.mutator);
}

/** Display names by set number: CommunityDragon's are internal (Set 18 ships as "Set10"). */
const SET_NAMES: Record<number, string> = {
  17: "Space Gods",
  18: "Enchanted Wilds",
};

export function setDisplayName(number: number, cdragonName: string): string {
  if (SET_NAMES[number]) return SET_NAMES[number];
  return /^set\s*\d+$/i.test(cdragonName.trim()) ? `Set ${number}` : cdragonName;
}

// ─── Traits ─────────────────────────────────────────────────────────────────

/** CommunityDragon trait `style` codes (2 is unused). */
const CDRAGON_TRAIT_STYLES: Record<number, TraitStyle> = {
  1: "bronze",
  3: "silver",
  4: "unique",
  5: "gold",
  6: "prismatic",
};

const STYLE_RANK: Record<TraitStyle, number> = { bronze: 0, silver: 1, gold: 2, prismatic: 3, unique: 4 };

/**
 * Trait effects → breakpoints sorted by unit count. Drops effects without a unit
 * count or with an unknown style, and keeps the lowest style when a count repeats.
 */
export function traitBreakpoints(effects: z.infer<typeof traitSchema>["effects"]): TraitBreakpoint[] {
  const breakpoints = effects
    .flatMap(({ minUnits, style }) => {
      const name = style === null ? undefined : CDRAGON_TRAIT_STYLES[style];
      return minUnits !== null && minUnits >= 1 && name ? [{ min: minUnits, style: name }] : [];
    })
    .sort((a, b) => a.min - b.min || STYLE_RANK[a.style] - STYLE_RANK[b.style]);
  return breakpoints.filter((bp, i) => i === 0 || bp.min !== breakpoints[i - 1]!.min);
}

/**
 * Bonus text for exactly the breakpoints `traitBreakpoints` keeps. `rows[i]` is
 * `effects[i]`'s text (`traitText`); where a unit count repeats, the text comes from the
 * effect whose style was kept, so a tooltip's tier and its colour always agree.
 */
export function traitEffects(
  effects: z.infer<typeof traitSchema>["effects"],
  rows: readonly (string | null)[],
): TraitEffect[] {
  return traitBreakpoints(effects).flatMap(({ min, style }) => {
    const index = effects.findIndex(
      (effect, i) =>
        effect.minUnits === min && effect.style !== null && CDRAGON_TRAIT_STYLES[effect.style] === style && rows[i],
    );
    const text = index === -1 ? null : rows[index];
    return text ? [{ min, text }] : [];
  });
}

// ─── Items ──────────────────────────────────────────────────────────────────

/** Hashed CommunityDragon item tags; stable across patches, but only exported as hashes. */
const ITEM_TAGS = {
  component: "component",
  completed: "{7ea41d13}",
  radiant: "{6ef5c598}",
  artifact: "{44ace175}",
  support: "{27557a09}",
  emblem: "{ebcd1bac}",
} as const;

/** Tags first (most reliable), then api-name and recipe fallbacks. */
export function itemKind(item: CdragonItem, isEmblem: boolean): ItemKind {
  const tags = new Set(item.tags ?? []);
  if (isEmblem) return "emblem";
  if (tags.has(ITEM_TAGS.component)) return "component";
  if (tags.has(ITEM_TAGS.radiant)) return "radiant";
  if (tags.has(ITEM_TAGS.artifact)) return "artifact";
  if (tags.has(ITEM_TAGS.support)) return "support";
  if (tags.has(ITEM_TAGS.completed)) return "completed";
  if (/Radiant/.test(item.apiName)) return "radiant";
  if (/Artifact|_Item_Ornn/.test(item.apiName)) return "artifact";
  if (item.composition?.length === 2) return "completed";
  return "other";
}

/** Strips client markup like `<rules>(2 uses left!)</rules>`; empty names fall back to the api name. */
export function cleanItemName(name: string | null | undefined, apiName: string): string {
  const clean = (name ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  return clean || apiName;
}

// ─── Team Planner ids ───────────────────────────────────────────────────────

/** Largest id a team code slot holds: three hex digits (`curated/team-code.ts`). */
export const MAX_TEAM_PLANNER_CODE = 0xfff;

const teamPlannerSchema = z.record(
  z.string(),
  z.array(z.object({ character_id: z.string(), team_planner_code: z.number().nullish() })),
);

/** `<version>/plugins/rcp-be-lol-game-data/global/default/v1/tftchampions-teamplanner.json`. */
export function teamPlannerUrl(patch: string): string {
  return `${CDRAGON_ORIGIN}/${patch}/plugins/rcp-be-lol-game-data/global/default/v1/tftchampions-teamplanner.json`;
}

/**
 * The client's Team Planner roster → id by champion api name, for one set mutator
 * ("TFTSet18"). The file is keyed by mutator and lists `character_id`, the same
 * `DA_…` name as `champions.api_name`. An id that is not an integer a slot can hold
 * is dropped, so a bad row costs that unit its code rather than corrupting every code.
 */
export function teamPlannerCodes(json: unknown, mutator: string): Map<string, number> {
  const roster = teamPlannerSchema.parse(json)[mutator] ?? [];
  const codes = new Map<string, number>();
  for (const { character_id, team_planner_code: code } of roster) {
    if (Number.isInteger(code) && code! >= 1 && code! <= MAX_TEAM_PLANNER_CODE) codes.set(character_id, code!);
  }
  return codes;
}

// ─── Snapshot ───────────────────────────────────────────────────────────────

export type StaticSnapshot = {
  set: TablesInsert<"tft_sets">;
  traits: TablesInsert<"traits">[];
  champions: TablesInsert<"champions">[];
  items: TablesInsert<"items">[];
  warnings: string[];
};

export type SnapshotOptions = {
  /** Game-data version directory for icon URLs, e.g. "16.18". */
  patch: string;
  /** Set number; defaults to the newest standard set. */
  setNumber?: number;
  /**
   * Trait type by api name (MetaTFT's lookup file; CommunityDragon has none). Undefined
   * when unavailable: `kind` is then left out of the rows entirely, so the stored values
   * survive. A trait the map lacks gets null and one warning for all of them.
   */
  traitKinds?: ReadonlyMap<string, TraitKind>;
  /**
   * Team Planner id by champion api name (`teamPlannerCodes`). Undefined when the planner
   * file is unavailable: `team_planner_code` is then left out of the rows, so stored codes
   * survive. A champion the map lacks gets null and one warning for all of them.
   */
  plannerCodes?: ReadonlyMap<string, number>;
};

export function buildStaticSnapshot(data: CdragonTft, options: SnapshotOptions): StaticSnapshot {
  const { patch } = options;
  const warnings: string[] = [];
  const cdSet = pickSet(data, options.setNumber);
  const setId = cdSet.number;

  // Traits. Champions reference them by display name, so map name → api name.
  const { traitKinds } = options;
  const traits = cdSet.traits.map((trait) => {
    const text = traitText(trait.desc, trait.effects);
    return {
      api_name: trait.apiName,
      set_id: setId,
      name: trait.name,
      breakpoints: traitBreakpoints(trait.effects),
      icon_url: cdragonAssetUrl(trait.icon, patch),
      description: text.description,
      effects: traitEffects(trait.effects, text.rows),
      // Omitted rather than null when there is no source, so an upsert keeps the kinds
      // an earlier sync stored instead of wiping them over a failed fetch.
      ...(traitKinds ? { kind: traitKinds.get(trait.apiName) ?? null } : {}),
    };
  });
  if (traitKinds) {
    const untyped = traits.filter((trait) => trait.kind === null).map((trait) => trait.api_name);
    if (untyped.length) warnings.push(`No trait type for ${untyped.join(", ")}; their kind stays null.`);
  }
  const traitByName = new Map<string, string>();
  for (const trait of [...cdSet.traits].sort((a, b) => a.apiName.length - b.apiName.length)) {
    const existing = traitByName.get(trait.name);
    if (existing) {
      warnings.push(`Trait name "${trait.name}" is shared by ${existing} and ${trait.apiName}; champions use ${existing}.`);
    } else {
      traitByName.set(trait.name, trait.apiName);
    }
  }

  // Champions: every playable unit, each a shop unit. A cost of 1–5 plus at least one
  // trait excludes the traitless legacy summons and the cost-8/11 anvils. Data Dragon's
  // shop list is not consulted: it omits Set 18's Riftbeasts, which the shop sells at
  // their costs like any other champion (§4.8).
  const { plannerCodes } = options;
  const playable = cdSet.champions.filter((c) => c.cost >= 1 && c.cost <= 5 && c.traits.length > 0);
  const champions = playable.map((c) => ({
    api_name: c.apiName,
    set_id: setId,
    name: c.name,
    cost: c.cost,
    traits: c.traits.flatMap((name) => {
      const apiName = traitByName.get(name);
      if (!apiName) warnings.push(`${c.apiName}: unknown trait "${name}" skipped.`);
      return apiName ? [apiName] : [];
    }),
    icon_url: cdragonAssetUrl(c.tileIcon ?? c.squareIcon ?? c.icon, patch),
    // Explicit rather than the column default, so an upsert clears a stale false.
    is_shop_unit: true,
    // Omitted rather than null without a source, the same rule as `traits.kind`.
    ...(plannerCodes ? { team_planner_code: plannerCodes.get(c.apiName) ?? null } : {}),
  }));
  if (plannerCodes) {
    const unplanned = champions.filter((c) => c.team_planner_code === null).map((c) => c.api_name);
    if (unplanned.length) {
      warnings.push(`No Team Planner code for ${unplanned.join(", ")}; team codes skip them.`);
    }
  }

  // Items: everything the set's pool references. Emblems name their trait: "Coven Emblem".
  const rawItems = new Map(data.items.map((item) => [item.apiName, item]));
  const items = [...new Set(cdSet.items)].flatMap((apiName) => {
    const raw = rawItems.get(apiName);
    if (!raw) {
      warnings.push(`Item ${apiName} is in the set's pool but missing from the item list; skipped.`);
      return [];
    }
    const item = parseOrThrow(itemSchema, raw, apiName);
    const name = cleanItemName(item.name, item.apiName);
    const emblemOf = /^(.+) Emblem$/.exec(name)?.[1];
    const grantsTrait = emblemOf ? (traitByName.get(emblemOf) ?? null) : null;
    const taggedEmblem = item.tags?.includes(ITEM_TAGS.emblem) ?? false;
    if (taggedEmblem && !grantsTrait) warnings.push(`Emblem ${apiName} ("${name}") matches no trait.`);
    return [
      {
        api_name: item.apiName,
        name,
        kind: itemKind(item, taggedEmblem || grantsTrait !== null),
        components: item.composition ?? [],
        grants_trait: grantsTrait,
        icon_url: cdragonAssetUrl(item.icon, patch),
        is_active: true,
      },
    ];
  });

  return {
    set: {
      id: setId,
      mutator: cdSet.mutator,
      name: setDisplayName(setId, cdSet.name),
      patch,
      is_active: true,
    },
    traits,
    champions,
    items,
    warnings,
  };
}
