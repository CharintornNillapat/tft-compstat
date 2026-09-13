/**
 * A comp → the code the TFT client's Team Planner imports (architecture §9, Phase 6 Task 15).
 * Pure and client-safe.
 *
 *   02 · ten slots of three hex digits · set mutator
 *   02 40f 429 428 3f3 419 426 3f7 401 3fc 000 TFTSet18
 *
 * Each slot is a champion's `team_planner_code` (CommunityDragon, stored by `sync:static`)
 * in lowercase hex; unused slots are `000` at the end. The older `01` format — two hex
 * digits of a champion's alphabetical index — predates the ids and is not used.
 */

export const TEAM_PLANNER_SLOTS = 10;
const VERSION = "02";
const SLOT_DIGITS = 3;
const EMPTY_SLOT = "0".repeat(SLOT_DIGITS);
const MAX_CODE = 16 ** SLOT_DIGITS - 1;

export type PlannerUnit = { apiName: string; name: string; plannerCode: number | null };

export type SkippedUnit = {
  name: string;
  /** `no-code`: the planner does not list the unit (a non-Base Lux form); `full`: all ten slots taken. */
  reason: "no-code" | "full";
};

export type TeamCode = { code: string; units: number; skipped: SkippedUnit[] };

/**
 * Units in the order given, so the caller's carries-first order is the planner's order.
 * Null when nothing can be encoded — no unit has a code, or the set is not a standard
 * `TFTSet<N>` (a mode like `TFTSet18_PAIRS` has no planner) — so the page shows no button.
 */
export function buildTeamCode(units: readonly PlannerUnit[], setMutator: string): TeamCode | null {
  if (!/^TFTSet\d+$/.test(setMutator)) return null;
  const slots: string[] = [];
  const skipped: SkippedUnit[] = [];
  for (const unit of units) {
    const code = unit.plannerCode;
    if (code === null || !Number.isInteger(code) || code < 1 || code > MAX_CODE) {
      skipped.push({ name: unit.name, reason: "no-code" });
    } else if (slots.length === TEAM_PLANNER_SLOTS) {
      skipped.push({ name: unit.name, reason: "full" });
    } else {
      slots.push(code.toString(16).padStart(SLOT_DIGITS, "0"));
    }
  }
  if (slots.length === 0) return null;
  const padding = EMPTY_SLOT.repeat(TEAM_PLANNER_SLOTS - slots.length);
  return { code: `${VERSION}${slots.join("")}${padding}${setMutator}`, units: slots.length, skipped };
}

/** The button's tooltip: where to paste, and which units the code leaves out. */
export function teamCodeHint({ skipped }: TeamCode): string {
  const hint = "Paste into the TFT Team Planner (Import)";
  const unlisted = skipped.filter((unit) => unit.reason === "no-code").map((unit) => unit.name);
  const overflow = skipped.filter((unit) => unit.reason === "full").map((unit) => unit.name);
  return [
    hint,
    unlisted.length ? `Not in the planner: ${unlisted.join(", ")}` : null,
    overflow.length ? `Over ${TEAM_PLANNER_SLOTS} units, left out: ${overflow.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join(". ");
}
