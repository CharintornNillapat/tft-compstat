import type { TraitBreakpoint, TraitStyle } from "@/lib/static/game";
import type { MatchDto, ParticipantDto } from "@/lib/riot/schemas";
import type { TablesInsert } from "@/lib/supabase/types";
import { buildSignature, DERIVED_VERSION, type SignatureTrait, type SignatureUnit } from "./comp-signature";
import { patchForMatch } from "./patches";

/**
 * Riot MatchDto → `matches` + `player_matches` rows (architecture §4.4, §6).
 * Pure: `sync-service.ts` does the I/O, this only transforms, so `scripts/rederive.ts`
 * can replay it over `matches.raw` with 0 API calls.
 */

/** What derivation needs from the static tables. */
export type StaticLookup = {
  championCost: (apiName: string) => number | undefined;
  traitBreakpoints: (apiName: string) => readonly TraitBreakpoint[] | undefined;
};

/**
 * Riot's match-API `style` codes, used only when a trait is missing from `traits`
 * (a new set, or a stale static sync). The stored breakpoints are authoritative:
 * Riot reports 3 for unique traits as well as for gold, so this can't stand alone (§6.1).
 */
const RIOT_STYLE_FALLBACK: Record<number, TraitStyle> = {
  1: "bronze",
  2: "silver",
  3: "gold",
  4: "prismatic",
};

/** One entry of `player_matches.traits` — active traits only. */
export type DerivedTrait = {
  name: string;
  num_units: number;
  style: TraitStyle;
  tier_current: number;
  tier_total: number;
};

/** One entry of `player_matches.units`. */
export type DerivedUnit = {
  character_id: string;
  star: number;
  items: string[];
};

/**
 * The style a trait reached. `tier_current` is Riot's 1-based index into the same
 * breakpoints we store, so it resolves against our table rather than Riot's code (§6.1).
 * Returns undefined when the trait is inactive.
 */
export function traitStyle(
  trait: { style?: number | null; tier_current?: number | null; tier_total?: number | null },
  breakpoints: readonly TraitBreakpoint[] | undefined,
): TraitStyle | undefined {
  const tier = trait.tier_current ?? 0;
  const code = trait.style ?? 0;
  if (tier <= 0 && code <= 0) return undefined;

  const reached = breakpoints?.[tier - 1];
  if (reached) return reached.style;

  // Unknown trait: fall back to Riot's code, treating a single-breakpoint trait as unique.
  if ((trait.tier_total ?? 0) === 1) return "unique";
  return RIOT_STYLE_FALLBACK[code] ?? "bronze";
}

export function deriveTraits(participant: ParticipantDto, lookup: StaticLookup): DerivedTrait[] {
  return participant.traits.flatMap((trait) => {
    const style = traitStyle(trait, lookup.traitBreakpoints(trait.name));
    if (!style) return [];
    return [
      {
        name: trait.name,
        num_units: trait.num_units,
        style,
        tier_current: trait.tier_current ?? 0,
        tier_total: trait.tier_total ?? 0,
      },
    ];
  });
}

export function deriveUnits(participant: ParticipantDto): DerivedUnit[] {
  return participant.units.map((unit) => ({
    character_id: unit.character_id,
    star: unit.tier ?? 1,
    items: unit.itemNames,
  }));
}

export function findParticipant(dto: MatchDto, puuid: string): ParticipantDto | undefined {
  return dto.info.participants.find((participant) => participant.puuid === puuid);
}

/** The immutable `matches` row. `raw` is the untouched response, not the parsed subset. */
export function deriveMatch(dto: MatchDto, raw: unknown): TablesInsert<"matches"> {
  const setNumber = dto.info.tft_set_number ?? 0;
  return {
    match_id: dto.metadata.match_id,
    set_number: setNumber,
    game_version: dto.info.game_version,
    // Set 18's game_version carries no number, so the label comes from the date (§6.4).
    patch: patchForMatch(setNumber, dto.info.game_datetime),
    queue_id: dto.info.queue_id ?? 0,
    game_datetime: new Date(dto.info.game_datetime).toISOString(),
    game_length_s: dto.info.game_length,
    raw: raw as TablesInsert<"matches">["raw"],
  };
}

/** The tracked player's `player_matches` row. Throws if they aren't in the lobby. */
export function derivePlayerMatch(
  dto: MatchDto,
  puuid: string,
  lookup: StaticLookup,
): TablesInsert<"player_matches"> {
  const participant = findParticipant(dto, puuid);
  if (!participant) {
    throw new Error(`Match ${dto.metadata.match_id} has no participant ${puuid.slice(0, 8)}…`);
  }

  const traits = deriveTraits(participant, lookup);
  const units = deriveUnits(participant);

  const signatureUnits: SignatureUnit[] = units.map((unit) => ({
    apiName: unit.character_id,
    star: unit.star,
    itemCount: unit.items.length,
    cost: lookup.championCost(unit.character_id),
  }));
  const signatureTraits: SignatureTrait[] = traits.map((trait) => ({
    apiName: trait.name,
    numUnits: trait.num_units,
    style: trait.style,
    tierTotal: trait.tier_total,
  }));
  const signature = buildSignature(signatureUnits, signatureTraits);

  return {
    match_id: dto.metadata.match_id,
    puuid,
    game_datetime: new Date(dto.info.game_datetime).toISOString(),
    queue_id: dto.info.queue_id ?? 0,
    set_number: dto.info.tft_set_number ?? 0,
    placement: participant.placement,
    level: participant.level ?? null,
    last_round: participant.last_round ?? null,
    gold_left: participant.gold_left ?? null,
    damage_to_players: participant.total_damage_to_players ?? null,
    time_eliminated_s: participant.time_eliminated ?? null,
    traits: traits as unknown as TablesInsert<"player_matches">["traits"],
    units: units as unknown as TablesInsert<"player_matches">["units"],
    carry_unit: signature.carryUnit ?? null,
    primary_traits: signature.primaryTraits,
    comp_key: signature.compKey,
    derived_version: DERIVED_VERSION,
  };
}
