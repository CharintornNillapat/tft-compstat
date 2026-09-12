/**
 * Tailwind classes per placement band, spelled out in full so Tailwind can see
 * them — the same rule `cost-styles.ts` follows. These are the `place-*` tokens
 * defined in `globals.css` (architecture §9).
 */

export type PlacementBand = "win" | "top4" | "bot4";

export function placementBand(placement: number): PlacementBand {
  if (placement === 1) return "win";
  return placement <= 4 ? "top4" : "bot4";
}

export const PLACEMENT_PILL: Record<PlacementBand, string> = {
  win: "bg-place-win/15 text-place-win",
  top4: "bg-place-top4/15 text-place-top4",
  bot4: "bg-place-bot4/15 text-muted",
};

export const PLACEMENT_TEXT: Record<PlacementBand, string> = {
  win: "text-place-win",
  top4: "text-place-top4",
  bot4: "text-muted",
};

/** SVG marks: the sparkline's dots and the histogram's bars. */
export const PLACEMENT_FILL: Record<PlacementBand, string> = {
  win: "fill-place-win",
  top4: "fill-place-top4",
  bot4: "fill-place-bot4",
};

const ORDINALS = new Intl.PluralRules("en", { type: "ordinal" });
const SUFFIXES: Record<string, string> = { one: "st", two: "nd", few: "rd", other: "th" };

/** "1st", "2nd", "3rd", "4th" — the accessible name for a placement pill. */
export function ordinal(n: number): string {
  return `${n}${SUFFIXES[ORDINALS.select(n)] ?? "th"}`;
}
