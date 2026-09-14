import type { PlannerUnit } from "@/lib/curated/team-code";
import type { TraitUnit } from "@/lib/curated/traits";
import { BOARD_COLS, BOARD_ROWS, MAX_UNIT_ITEMS } from "@/lib/static/game";

/**
 * The `/planner` board (architecture §9, Phase 6 Task 16). Pure and client-safe: every
 * edit returns a new board plus an error message instead of throwing, so the UI can
 * show "Ashe already holds 3 items" inline and keep the board it had.
 *
 * The rules are the curated comp rules (§7 "Comp checks"): one copy per champion, one
 * unit per hex, at most three items, and no emblem for a trait the unit already has.
 */

export type PlannerChampion = {
  apiName: string;
  name: string;
  cost: number;
  iconUrl: string | null;
  /** Trait api names. */
  traits: readonly string[];
  /** Team Planner id; null for a unit the in-game planner does not list. */
  plannerCode: number | null;
};

export const PLANNER_ITEM_KINDS = ["completed", "emblem", "artifact"] as const;
export type PlannerItemKind = (typeof PLANNER_ITEM_KINDS)[number];

export type PlannerItem = {
  apiName: string;
  name: string;
  iconUrl: string | null;
  kind: PlannerItemKind;
  /** Trait api name, for emblems. */
  grantsTrait: string | null;
};

/** Everything the rules look up, keyed by api name (a `Record` for the Flight payload, as in `names.ts`). */
export type PlannerCatalog = {
  champions: Record<string, PlannerChampion>;
  items: Record<string, PlannerItem>;
  /** Trait display names by api name. */
  traitNames: Record<string, string>;
};

export type Star = 1 | 2 | 3;
export const STARS: readonly Star[] = [1, 2, 3];
export const DEFAULT_STAR: Star = 2;

export type Hex = { row: number; col: number };
export type BoardUnit = Hex & { apiName: string; star: Star; items: readonly string[] };
export type Board = readonly BoardUnit[];
export type BoardResult = { board: Board; error: string | null };

export const BOARD_HEXES = BOARD_ROWS * BOARD_COLS;

const ok = (board: Board): BoardResult => ({ board, error: null });
const fail = (board: Board, error: string): BoardResult => ({ board, error });

export function isHex(hex: Hex): boolean {
  const { row, col } = hex;
  return Number.isInteger(row) && Number.isInteger(col) && row >= 0 && row < BOARD_ROWS && col >= 0 && col < BOARD_COLS;
}

export const sameHex = (a: Hex, b: Hex) => a.row === b.row && a.col === b.col;

export function unitAt(board: Board, hex: Hex): BoardUnit | undefined {
  return board.find((unit) => sameHex(unit, hex));
}

const championName = (catalog: PlannerCatalog, apiName: string) => catalog.champions[apiName]?.name ?? apiName;

/**
 * Puts a champion on a hex. A champion already on the board moves there instead
 * (swapping with whatever holds the hex), since the board takes one copy of each.
 * A different unit on the hex is replaced — the caller names it, if it wants to.
 */
export function placeUnit(board: Board, apiName: string, hex: Hex, catalog: PlannerCatalog): BoardResult {
  if (!catalog.champions[apiName]) return fail(board, `Unknown champion ${apiName}.`);
  if (!isHex(hex)) return fail(board, "That hex is off the board.");
  const existing = board.find((unit) => unit.apiName === apiName);
  if (existing) return moveUnit(board, existing, hex);
  const rest = board.filter((unit) => !sameHex(unit, hex));
  return ok([...rest, { apiName, row: hex.row, col: hex.col, star: DEFAULT_STAR, items: [] }]);
}

/** Moves the unit on `from` to `to`, swapping the two when `to` is taken. */
export function moveUnit(board: Board, from: Hex, to: Hex): BoardResult {
  if (!isHex(to)) return fail(board, "That hex is off the board.");
  if (!unitAt(board, from)) return fail(board, "There is no unit on that hex.");
  if (sameHex(from, to)) return ok(board);
  return ok(
    board.map((unit) => {
      if (sameHex(unit, from)) return { ...unit, row: to.row, col: to.col };
      if (sameHex(unit, to)) return { ...unit, row: from.row, col: from.col };
      return unit;
    }),
  );
}

export function removeUnit(board: Board, hex: Hex): BoardResult {
  if (!unitAt(board, hex)) return fail(board, "There is no unit on that hex.");
  return ok(board.filter((unit) => !sameHex(unit, hex)));
}

export function setStar(board: Board, hex: Hex, star: number): BoardResult {
  if (!STARS.includes(star as Star)) return fail(board, "Star level must be 1, 2 or 3.");
  if (!unitAt(board, hex)) return fail(board, "There is no unit on that hex.");
  return ok(board.map((unit) => (sameHex(unit, hex) ? { ...unit, star: star as Star } : unit)));
}

/** Traits the unit holds already: its own plus those of emblems it carries. */
function heldTraits(unit: BoardUnit, catalog: PlannerCatalog): Set<string> {
  return new Set([
    ...(catalog.champions[unit.apiName]?.traits ?? []),
    ...unit.items.flatMap((apiName) => catalog.items[apiName]?.grantsTrait ?? []),
  ]);
}

/** Gives the unit on `hex` an item, within the three-item and emblem rules. */
export function equipItem(board: Board, hex: Hex, itemApiName: string, catalog: PlannerCatalog): BoardResult {
  const item = catalog.items[itemApiName];
  if (!item) return fail(board, `Unknown item ${itemApiName}.`);
  const unit = unitAt(board, hex);
  if (!unit) return fail(board, "Select a unit on the board first.");
  const name = championName(catalog, unit.apiName);
  if (unit.items.length >= MAX_UNIT_ITEMS) return fail(board, `${name} already holds ${MAX_UNIT_ITEMS} items.`);
  if (item.grantsTrait && heldTraits(unit, catalog).has(item.grantsTrait)) {
    const trait = catalog.traitNames[item.grantsTrait] ?? item.grantsTrait;
    return fail(board, `${name} already has ${trait}, so ${item.name} would add nothing.`);
  }
  return ok(board.map((other) => (other === unit ? { ...unit, items: [...unit.items, itemApiName] } : other)));
}

export function unequipItem(board: Board, hex: Hex, index: number): BoardResult {
  const unit = unitAt(board, hex);
  if (!unit) return fail(board, "There is no unit on that hex.");
  if (!Number.isInteger(index) || index < 0 || index >= unit.items.length) return fail(board, "No item in that slot.");
  return ok(board.map((other) => (other === unit ? { ...unit, items: unit.items.filter((_, i) => i !== index) } : other)));
}

/**
 * Rebuilds a board from untrusted units (localStorage) through the same rules as the
 * editor, so a stored board can never hold what the editor would refuse. Each dropped
 * unit or item is reported rather than silently lost.
 */
export function sanitizeBoard(
  units: readonly { apiName: string; row: number; col: number; star: number; items: readonly string[] }[],
  catalog: PlannerCatalog,
): { board: Board; issues: string[] } {
  let board: Board = [];
  const issues: string[] = [];
  for (const unit of units) {
    const name = championName(catalog, unit.apiName);
    if (!catalog.champions[unit.apiName]) {
      issues.push(`${unit.apiName} is not a champion of this set, so it was removed.`);
    } else if (!isHex(unit)) {
      issues.push(`${name} was off the board, so it was removed.`);
    } else if (board.some((other) => other.apiName === unit.apiName)) {
      issues.push(`${name} was on the board twice; the second copy was removed.`);
    } else if (unitAt(board, unit)) {
      issues.push(`${name} shared a hex with ${championName(catalog, unitAt(board, unit)!.apiName)}, so it was removed.`);
    } else {
      const star = STARS.includes(unit.star as Star) ? (unit.star as Star) : DEFAULT_STAR;
      board = [...board, { apiName: unit.apiName, row: unit.row, col: unit.col, star, items: [] }];
      for (const item of unit.items) {
        const result = equipItem(board, unit, item, catalog);
        if (result.error) issues.push(result.error.replace(/^Unknown item (.+)\.$/, `${name}: unknown item $1 was removed.`));
        board = result.board;
      }
    }
  }
  return { board, issues };
}

/**
 * The order a team code takes units in: most items first — the carries — then cost,
 * highest first, then back row first. The first ten are the ones a code holds.
 */
export function plannerOrder(board: Board, catalog: PlannerCatalog): BoardUnit[] {
  const cost = (unit: BoardUnit) => catalog.champions[unit.apiName]?.cost ?? 0;
  return [...board].sort(
    (a, b) => b.items.length - a.items.length || cost(b) - cost(a) || b.row - a.row || a.col - b.col,
  );
}

/** Input for `buildTeamCode`, in `plannerOrder`. */
export function toPlannerUnits(board: Board, catalog: PlannerCatalog): PlannerUnit[] {
  return plannerOrder(board, catalog).map((unit) => ({
    apiName: unit.apiName,
    name: championName(catalog, unit.apiName),
    plannerCode: catalog.champions[unit.apiName]?.plannerCode ?? null,
  }));
}

/** Input for `computeActiveTraits`: each champion's traits plus its emblems'. */
export function toTraitUnits(board: Board, catalog: PlannerCatalog): TraitUnit[] {
  return board.map((unit) => ({
    apiName: unit.apiName,
    traits: catalog.champions[unit.apiName]?.traits ?? [],
    emblemTraits: unit.items.flatMap((apiName) => catalog.items[apiName]?.grantsTrait ?? []),
  }));
}
