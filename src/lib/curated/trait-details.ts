import type { TraitBreakpoint, TraitEffect, TraitKind, TraitStyle } from "@/lib/static/game";

/**
 * What a trait tooltip shows beyond a board's count (architecture §9): the trait's text
 * from `traits.description` / `traits.effects`, and every champion that carries it.
 * Pure and client-safe; `queries.ts` builds it on the server.
 */

export type TraitMember = { apiName: string; name: string; cost: number; iconUrl: string | null };

/** One breakpoint with its bonus text; null where the source has no row for it. */
export type TraitTier = { min: number; style: TraitStyle; text: string | null };

export type TraitDetail = {
  /** Origin, class or unique; null when `sync:static` had no source for it. */
  kind: TraitKind | null;
  description: string | null;
  tiers: TraitTier[];
  members: TraitMember[];
};

/** Keyed by trait api name. A Record rather than a Map, for the same reason as `NameBook`. */
export type TraitDetailBook = Record<string, TraitDetail>;

/** Shown when a trait has neither a description nor any per-breakpoint text. */
export const MISSING_TRAIT_TEXT = "No description synced for this trait yet.";

/** `traits.effects` jsonb → entries. Anything not shaped `{ min, text }` is dropped rather than rendered. */
export function parseTraitEffects(json: unknown): TraitEffect[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((entry: unknown) => {
    if (typeof entry !== "object" || entry === null) return [];
    const { min, text } = entry as { min?: unknown; text?: unknown };
    return typeof min === "number" && typeof text === "string" && text.trim() ? [{ min, text }] : [];
  });
}

/**
 * Float noise off every number in a stat line: `7.00001%` → `7%`, `3.0 seconds` →
 * `3 seconds`, `0.10000000149` → `0.1`. `sync:static` already rounds the values it
 * substitutes (§4.8), so this is the guard for text that reached the table some other
 * way — a number with three or more decimals is never meant, and neither is a `.0`.
 * Two real decimals (`12.5%`, `1.25`) and dotted versions (`16.18`) are left alone.
 */
export function cleanStatText(text: string): string {
  return text
    .replace(/(?<![\d.])\d+\.\d{3,}(?![\d.])/g, (match) => String(Number(Number(match).toFixed(2))))
    .replace(/(?<![\d.])(\d+)\.0+(?![\d.])/g, "$1");
}

/** Breakpoints joined with their text by unit count, so a tier can be coloured by its style. */
export function traitTiers(breakpoints: readonly TraitBreakpoint[], effects: readonly TraitEffect[]): TraitTier[] {
  const text = new Map(effects.map((effect) => [effect.min, cleanStatText(effect.text)]));
  return breakpoints.map(({ min, style }) => ({ min, style, text: text.get(min) ?? null }));
}

const byCostThenName = (a: TraitMember, b: TraitMember) =>
  a.cost - b.cost || a.name.localeCompare(b.name) || a.apiName.localeCompare(b.apiName);

/**
 * One detail per trait. Members run cheapest first, then by name, and a champion
 * fielded in several forms (Set 18's nine Lux elements) is listed once per name and
 * cost — which is why a board is matched against members **by name**.
 */
export function buildTraitDetails(input: {
  traits: readonly {
    apiName: string;
    breakpoints: readonly TraitBreakpoint[];
    description: string | null;
    effects: readonly TraitEffect[];
    kind?: TraitKind | null;
  }[];
  champions: readonly (TraitMember & { traits: readonly string[] })[];
}): TraitDetailBook {
  const members = new Map<string, TraitMember[]>();
  const seen = new Set<string>();
  for (const champion of [...input.champions].sort(byCostThenName)) {
    for (const trait of new Set(champion.traits)) {
      const key = `${trait}|${champion.name}|${champion.cost}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const list = members.get(trait) ?? [];
      list.push({ apiName: champion.apiName, name: champion.name, cost: champion.cost, iconUrl: champion.iconUrl });
      members.set(trait, list);
    }
  }

  return Object.fromEntries(
    input.traits.map((trait) => [
      trait.apiName,
      {
        kind: trait.kind ?? null,
        description: trait.description?.trim() ? cleanStatText(trait.description.trim()) : null,
        tiers: traitTiers(trait.breakpoints, trait.effects),
        members: members.get(trait.apiName) ?? [],
      },
    ]),
  );
}

/** The subset of the book a page shows, so unused traits never cross to the client. */
export function pickTraitDetails(book: TraitDetailBook, apiNames: Iterable<string>): TraitDetailBook {
  const out: TraitDetailBook = {};
  for (const apiName of apiNames) {
    const detail = book[apiName];
    if (detail) out[apiName] = detail;
  }
  return out;
}
