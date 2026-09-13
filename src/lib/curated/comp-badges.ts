import type { CompStyle } from "@/lib/static/game";

/**
 * The rules behind the /comps meta badges (architecture §9). Pure and client-safe, so
 * a threshold is pinned by a test rather than read off a screenshot.
 */

/** Pick rate — a fraction, like every rate in `CompStats` — from which a comp is contested. */
export const CONTESTED_PICK_RATE = 0.12;

/** Played often enough that the lobby is fighting you for its units. */
export function isContested(pickRate: number | null): boolean {
  return pickRate !== null && pickRate >= CONTESTED_PICK_RATE;
}

export type DifficultyLevel = 1 | 2 | 3;

/** `comps.difficulty` → 1–3, or null. The DB checks the range; this keeps a stray value off the page. */
export function difficultyLevel(value: number | null): DifficultyLevel | null {
  return value === 1 || value === 2 || value === 3 ? value : null;
}

export type PlaystyleKind = "fast" | "reroll" | "flex";

/** Which glyph a playstyle badge wears: levelling, rolling, or neither. */
export function playstyleKind(style: CompStyle): PlaystyleKind {
  if (style === "fast8" || style === "fast9") return "fast";
  return style.startsWith("reroll_") ? "reroll" : "flex";
}
