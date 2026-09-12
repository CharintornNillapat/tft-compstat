import type { TraitStyle } from "@/lib/static/game";

/**
 * Comp signature v1 (architecture §6.2). Pure and versioned: changing anything here
 * means bumping `DERIVED_VERSION` and running `scripts/rederive.ts`, which recomputes
 * from `matches.raw` with 0 API calls.
 */

/** Bump when this file or `derive.ts` changes meaning. Stored in `player_matches.derived_version`. */
export const DERIVED_VERSION = 1;

/** How many traits make up the signature. */
const PRIMARY_TRAIT_COUNT = 2;

const STYLE_RANK: Record<TraitStyle, number> = {
  bronze: 1,
  silver: 2,
  gold: 3,
  prismatic: 4,
  // A unique trait is one unit by definition, so it says nothing about the comp's shape.
  unique: 0,
};

export type SignatureTrait = {
  apiName: string;
  numUnits: number;
  style: TraitStyle;
  /** Number of breakpoints the trait has; 1 means a unique trait. */
  tierTotal: number;
};

export type SignatureUnit = {
  apiName: string;
  /** Star level 1–3. */
  star: number;
  itemCount: number;
  /** From `champions.cost`; undefined for a unit missing from the static tables. */
  cost?: number;
};

/**
 * The traits that characterize a board: active, excluding uniques, strongest first.
 * Ties break by unit count, then by name so the result is deterministic.
 */
export function primaryTraits(traits: readonly SignatureTrait[], limit = PRIMARY_TRAIT_COUNT): string[] {
  return traits
    .filter((trait) => trait.tierTotal > 1 && STYLE_RANK[trait.style] > 0)
    .sort(
      (a, b) =>
        STYLE_RANK[b.style] - STYLE_RANK[a.style] ||
        b.numUnits - a.numUnits ||
        a.apiName.localeCompare(b.apiName),
    )
    .slice(0, limit)
    .map((trait) => trait.apiName);
}

/**
 * The carry: most items, then highest star, then most expensive. A board with no
 * itemized unit has no carry, which is normal for an early bust-out.
 */
export function carryUnit(units: readonly SignatureUnit[]): string | undefined {
  const itemized = units.filter((unit) => unit.itemCount > 0);
  if (itemized.length === 0) return undefined;
  return [...itemized].sort(
    (a, b) =>
      b.itemCount - a.itemCount ||
      b.star - a.star ||
      (b.cost ?? 0) - (a.cost ?? 0) ||
      a.apiName.localeCompare(b.apiName),
  )[0]!.apiName;
}

/**
 * `carry|TraitA+TraitB`, with the traits sorted so the same board always produces the
 * same key regardless of the order Riot listed them. An empty side stays empty rather
 * than collapsing, so "no carry" and "no traits" remain distinguishable.
 */
export function compKey(carry: string | undefined, traits: readonly string[]): string {
  return `${carry ?? ""}|${[...traits].sort().join("+")}`;
}

export type Signature = {
  carryUnit: string | undefined;
  primaryTraits: string[];
  compKey: string;
};

export function buildSignature(
  units: readonly SignatureUnit[],
  traits: readonly SignatureTrait[],
): Signature {
  const carry = carryUnit(units);
  const primary = primaryTraits(traits);
  return { carryUnit: carry, primaryTraits: primary, compKey: compKey(carry, primary) };
}

/** "Trait A Trait B · Carry", from display names resolved against the static tables. */
export function signatureLabel(
  signature: Pick<Signature, "carryUnit" | "primaryTraits">,
  names: { trait: (apiName: string) => string | undefined; champion: (apiName: string) => string | undefined },
): string {
  const traits = signature.primaryTraits.map((apiName) => names.trait(apiName) ?? apiName);
  const carry = signature.carryUnit ? (names.champion(signature.carryUnit) ?? signature.carryUnit) : undefined;
  if (traits.length === 0) return carry ?? "Unknown comp";
  return carry ? `${traits.join(" ")} · ${carry}` : traits.join(" ");
}
