import type { TraitStyle } from "@/lib/static/game";
import { traitRef, type NameBook } from "@/lib/static/names";
import type { DerivedTrait, DerivedUnit } from "@/lib/sync/derive";
import type { Tables } from "@/lib/supabase/types";
import type { MatchRow } from "./types";

/**
 * `player_matches` rows into the shape the dashboard renders (architecture §6.3).
 * Pure, so the mapping is testable against the real match fixture rather than only
 * against a live database.
 */

/**
 * `traits` and `units` are `jsonb`, so the generated type is `Json` and the shape
 * has to be re-asserted on the way out — the same cast `derive.ts` does on the way in.
 */
export function toMatchRow(row: Tables<"player_matches">): MatchRow {
  return {
    matchId: row.match_id,
    playedAt: row.game_datetime,
    queueId: row.queue_id,
    setNumber: row.set_number,
    placement: row.placement,
    level: row.level,
    carryUnit: row.carry_unit,
    primaryTraits: row.primary_traits,
    compKey: row.comp_key,
    traits: (row.traits ?? []) as unknown as DerivedTrait[],
    units: (row.units ?? []) as unknown as DerivedUnit[],
  };
}

/** Every api name these rows reference, for `pickNames` before crossing to the client. */
export function namesUsedBy(rows: readonly MatchRow[]): {
  champions: string[];
  traits: string[];
  items: string[];
} {
  const champions = new Set<string>();
  const traits = new Set<string>();
  const items = new Set<string>();
  for (const row of rows) {
    if (row.carryUnit) champions.add(row.carryUnit);
    for (const trait of row.primaryTraits) traits.add(trait);
    for (const trait of row.traits) traits.add(trait.name);
    for (const unit of row.units) {
      champions.add(unit.character_id);
      for (const item of unit.items) items.add(item);
    }
  }
  return { champions: [...champions], traits: [...traits], items: [...items] };
}

/**
 * The carry's items. An 8th-place bust-out has no carry and no items at all, which
 * is normal rather than exceptional — four of the first twenty synced matches.
 */
export function carryItems(row: MatchRow): string[] {
  if (!row.carryUnit) return [];
  return row.units.find((unit) => unit.character_id === row.carryUnit)?.items ?? [];
}

export type MatchTrait = {
  apiName: string;
  name: string;
  iconUrl: string | null;
  style: TraitStyle;
  count: number;
};

/**
 * Active traits ready for `TraitHex`, strongest first. This exists because
 * `DerivedTrait.name` is an **api** name while the badge wants a display name —
 * without the mapping the dashboard would render "DA_18_Hunter".
 *
 * The order matches `curated/traits.ts` so a match and a curated comp never disagree.
 */
const STYLE_ORDER: Record<TraitStyle, number> = {
  prismatic: 0,
  gold: 1,
  silver: 2,
  bronze: 3,
  unique: 4,
};

export function matchTraits(row: MatchRow, names: NameBook): MatchTrait[] {
  return row.traits
    .map((trait) => ({
      apiName: trait.name,
      name: traitRef(names, trait.name).name,
      iconUrl: traitRef(names, trait.name).iconUrl,
      style: trait.style,
      count: trait.num_units,
    }))
    .sort(
      (a, b) =>
        STYLE_ORDER[a.style] - STYLE_ORDER[b.style] ||
        b.count - a.count ||
        a.name.localeCompare(b.name),
    );
}
