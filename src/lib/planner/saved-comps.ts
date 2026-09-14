// zod/mini, not zod: this module runs in the browser, where full zod would be most of
// the planner's JavaScript (architecture §8).
import * as z from "zod/mini";
import { MAX_UNIT_ITEMS } from "@/lib/static/game";
import { sanitizeBoard, type Board, type PlannerCatalog } from "./board";

/**
 * "My Planner" saved comps (architecture §8, §9). They live in the viewer's
 * localStorage — the site has no accounts (§0) — so this module is the whole storage
 * contract: a versioned JSON document, read defensively because anything can be in
 * localStorage, and rebuilt through the board rules so a stored board never holds
 * what the editor would refuse. Pure; `components/planner/use-stored-value.ts` does the reading and writing.
 */

export const SAVED_COMPS_KEY = "tft-compstat:planner:v1";
export const DRAFT_KEY = "tft-compstat:planner:draft:v1";
export const MAX_SAVED_COMPS = 50;
export const MAX_COMP_NAME = 60;
export const UNTITLED = "Untitled comp";

export type SavedComp = {
  id: string;
  name: string;
  /** Set mutator ("TFTSet18"). A comp from another set is listed but cannot be loaded. */
  set: string;
  isFavorite: boolean;
  units: Board;
  /** ISO timestamp. */
  updatedAt: string;
};

// ─── Storage format ─────────────────────────────────────────────────────────

const storedUnitSchema = z.object({
  apiName: z.string().check(z.minLength(1)),
  // Range is checked by `sanitizeBoard`, so one bad hex drops a unit, not the comp.
  hex: z.object({ row: z.number(), col: z.number() }),
  star: z.number(),
  items: z.array(z.string()).check(z.maxLength(MAX_UNIT_ITEMS)),
});

const storedCompSchema = z.object({
  id: z.string().check(z.minLength(1)),
  name: z.string(),
  set: z.string().check(z.minLength(1)),
  isFavorite: z.optional(z.boolean()),
  units: z.array(storedUnitSchema),
  updatedAt: z.string(),
});

const storedFileSchema = z.object({ version: z.literal(1), comps: z.array(z.unknown()) });

type StoredUnit = z.infer<typeof storedUnitSchema>;

const toStored = (units: Board): StoredUnit[] =>
  units.map(({ apiName, row, col, star, items }) => ({ apiName, hex: { row, col }, star, items: [...items] }));

const fromStored = (units: readonly StoredUnit[]) =>
  units.map(({ apiName, hex, star, items }) => ({ apiName, row: hex.row, col: hex.col, star, items }));

export function cleanCompName(name: string): string {
  return name.replace(/\s+/g, " ").trim().slice(0, MAX_COMP_NAME).trim() || UNTITLED;
}

/** Favourites first, then most recently updated. */
export function sortComps(comps: readonly SavedComp[]): SavedComp[] {
  return [...comps].sort(
    (a, b) => Number(b.isFavorite) - Number(a.isFavorite) || b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
  );
}

export const isLoadable = (comp: SavedComp, mutator: string) => comp.set === mutator;

/**
 * Reads the stored document. Never throws: unreadable storage yields an empty list and
 * a notice, a malformed comp is skipped, and a comp of the current set is rebuilt
 * through `sanitizeBoard`, which names every unit or item it had to drop. Comps of
 * another set are kept as stored — this set's catalog cannot judge them.
 */
export function parseSavedComps(
  raw: string | null,
  catalog: PlannerCatalog,
  mutator: string,
): { comps: SavedComp[]; issues: string[] } {
  if (raw === null) return { comps: [], issues: [] };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { comps: [], issues: ["Saved comps could not be read. Saving a comp will replace them."] };
  }
  const file = storedFileSchema.safeParse(json);
  if (!file.success) {
    return { comps: [], issues: ["Saved comps are in a format this version cannot read. Saving a comp will replace them."] };
  }

  const comps: SavedComp[] = [];
  const issues: string[] = [];
  const ids = new Set<string>();
  for (const entry of file.data.comps) {
    const parsed = storedCompSchema.safeParse(entry);
    if (!parsed.success) {
      issues.push("A saved comp was unreadable and was skipped.");
      continue;
    }
    const stored = parsed.data;
    if (ids.has(stored.id)) continue;
    ids.add(stored.id);
    const name = cleanCompName(stored.name);
    let units: Board = fromStored(stored.units) as Board;
    if (stored.set === mutator) {
      const sanitized = sanitizeBoard(fromStored(stored.units), catalog);
      units = sanitized.board;
      issues.push(...sanitized.issues.map((issue) => `${name}: ${issue}`));
    }
    comps.push({ id: stored.id, name, set: stored.set, isFavorite: stored.isFavorite ?? false, units, updatedAt: stored.updatedAt });
  }
  const sorted = sortComps(comps);
  if (sorted.length > MAX_SAVED_COMPS) issues.push(`Only the first ${MAX_SAVED_COMPS} saved comps are kept.`);
  return { comps: sorted.slice(0, MAX_SAVED_COMPS), issues };
}

export function serializeSavedComps(comps: readonly SavedComp[]): string {
  return JSON.stringify({
    version: 1,
    comps: comps.map(({ id, name, set, isFavorite, units, updatedAt }) => ({
      id,
      name,
      set,
      isFavorite,
      units: toStored(units),
      updatedAt,
    })),
  });
}

// ─── Operations ─────────────────────────────────────────────────────────────

type CompsResult = { comps: SavedComp[]; error: string | null };

const full = (comps: readonly SavedComp[]): CompsResult => ({
  comps: [...comps],
  error: `My Planner holds ${MAX_SAVED_COMPS} comps. Delete one to save another.`,
});

/**
 * Saves the editor's board: updates the comp with `id` in place (keeping its favourite
 * flag), or adds it. Ids and time are passed in so this stays pure.
 */
export function saveComp(
  comps: readonly SavedComp[],
  input: { id: string; name: string; set: string; units: Board; now: string },
): CompsResult {
  const existing = comps.find((comp) => comp.id === input.id);
  const comp: SavedComp = {
    id: input.id,
    name: cleanCompName(input.name),
    set: input.set,
    isFavorite: existing?.isFavorite ?? false,
    units: input.units,
    updatedAt: input.now,
  };
  if (existing) return { comps: sortComps(comps.map((other) => (other.id === input.id ? comp : other))), error: null };
  if (comps.length >= MAX_SAVED_COMPS) return full(comps);
  return { comps: sortComps([...comps, comp]), error: null };
}

export function duplicateComp(comps: readonly SavedComp[], id: string, newId: string, now: string): CompsResult {
  const source = comps.find((comp) => comp.id === id);
  if (!source) return { comps: [...comps], error: "That comp no longer exists." };
  if (comps.length >= MAX_SAVED_COMPS) return full(comps);
  const suffix = " (copy)";
  const name = `${source.name.slice(0, MAX_COMP_NAME - suffix.length).trim()}${suffix}`;
  return { comps: sortComps([...comps, { ...source, id: newId, name, isFavorite: false, updatedAt: now }]), error: null };
}

export function deleteComp(comps: readonly SavedComp[], id: string): SavedComp[] {
  return comps.filter((comp) => comp.id !== id);
}

/** Pins or unpins without touching `updatedAt`: favouriting is not an edit. */
export function toggleFavorite(comps: readonly SavedComp[], id: string): SavedComp[] {
  return sortComps(comps.map((comp) => (comp.id === id ? { ...comp, isFavorite: !comp.isFavorite } : comp)));
}

// ─── Draft ──────────────────────────────────────────────────────────────────

/** The editor's unsaved board, so a reload does not lose it. `id` is the saved comp it edits, if any. */
export type Draft = { id: string | null; name: string; units: Board };

export function serializeDraft(draft: Draft, set: string): string {
  return JSON.stringify({ version: 1, set, id: draft.id, name: draft.name, units: toStored(draft.units) });
}

const draftSchema = z.object({
  version: z.literal(1),
  set: z.string(),
  id: z.nullable(z.string()),
  name: z.string(),
  units: z.array(storedUnitSchema),
});

/** Null when there is no usable draft, including one from another set. */
export function parseDraft(raw: string | null, catalog: PlannerCatalog, mutator: string): Draft | null {
  if (raw === null) return null;
  try {
    const parsed = draftSchema.safeParse(JSON.parse(raw));
    if (!parsed.success || parsed.data.set !== mutator) return null;
    // Raw, not `cleanCompName`: the draft is written on every keystroke, and trimming it
    // would eat the space typed between two words. Saving cleans the name.
    const name = parsed.data.name.slice(0, MAX_COMP_NAME);
    return { id: parsed.data.id, name, units: sanitizeBoard(fromStored(parsed.data.units), catalog).board };
  } catch {
    return null;
  }
}
