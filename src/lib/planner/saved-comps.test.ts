import { describe, expect, it } from "vitest";
import type { Board } from "./board";
import { CATALOG } from "./catalog.fixture";
import {
  cleanCompName,
  deleteComp,
  duplicateComp,
  isLoadable,
  MAX_COMP_NAME,
  MAX_SAVED_COMPS,
  parseDraft,
  parseSavedComps,
  saveComp,
  serializeDraft,
  serializeSavedComps,
  toggleFavorite,
  type SavedComp,
} from "./saved-comps";

const SET = "TFTSet18";
const BOARD: Board = [
  { apiName: "DA_18_Ashe", row: 3, col: 0, star: 3, items: ["DA_InfinityEdge"] },
  { apiName: "DA_18_Sentry", row: 0, col: 3, star: 2, items: [] },
];

const comp = (id: string, updatedAt: string, extra: Partial<SavedComp> = {}): SavedComp => ({
  id,
  name: `Comp ${id}`,
  set: SET,
  isFavorite: false,
  units: BOARD,
  updatedAt,
  ...extra,
});

describe("storage round trip", () => {
  it("serializes units with a hex object and reads them back unchanged", () => {
    const comps = [comp("a", "2026-09-14T10:00:00.000Z", { isFavorite: true })];
    const raw = serializeSavedComps(comps);
    expect(JSON.parse(raw).comps[0].units[0]).toEqual({
      apiName: "DA_18_Ashe",
      hex: { row: 3, col: 0 },
      star: 3,
      items: ["DA_InfinityEdge"],
    });
    expect(parseSavedComps(raw, CATALOG, SET)).toEqual({ comps, issues: [] });
  });

  it("treats a missing isFavorite as false", () => {
    const raw = JSON.stringify({
      version: 1,
      comps: [{ id: "a", name: "A", set: SET, units: [], updatedAt: "2026-09-14T10:00:00.000Z" }],
    });
    expect(parseSavedComps(raw, CATALOG, SET).comps[0]?.isFavorite).toBe(false);
  });
});

describe("parseSavedComps", () => {
  it("starts empty with no storage", () => {
    expect(parseSavedComps(null, CATALOG, SET)).toEqual({ comps: [], issues: [] });
  });

  it("never throws on corrupt or unknown storage", () => {
    expect(parseSavedComps("{nope", CATALOG, SET).issues[0]).toMatch(/could not be read/);
    expect(parseSavedComps(JSON.stringify({ version: 2, comps: [] }), CATALOG, SET).issues[0]).toMatch(/format/);
    expect(parseSavedComps("null", CATALOG, SET).comps).toEqual([]);
  });

  it("skips a malformed comp and a repeated id, keeping the rest", () => {
    const good = JSON.parse(serializeSavedComps([comp("a", "2026-09-14T10:00:00.000Z")])).comps[0];
    const raw = JSON.stringify({ version: 1, comps: [{ id: 5 }, good, { ...good, name: "Dupe" }] });
    const { comps, issues } = parseSavedComps(raw, CATALOG, SET);
    expect(comps.map((c) => c.name)).toEqual(["Comp a"]);
    expect(issues).toEqual(["A saved comp was unreadable and was skipped."]);
  });

  it("rebuilds a current-set board through the board rules and names what it dropped", () => {
    const raw = JSON.stringify({
      version: 1,
      comps: [
        {
          id: "a",
          name: "  Hunters  ",
          set: SET,
          updatedAt: "2026-09-14T10:00:00.000Z",
          units: [
            { apiName: "DA_18_Ashe", hex: { row: 3, col: 0 }, star: 2, items: ["DA_18_EmblemHunter"] },
            { apiName: "TFT17_Ahri", hex: { row: 0, col: 0 }, star: 2, items: [] },
          ],
        },
      ],
    });
    const { comps, issues } = parseSavedComps(raw, CATALOG, SET);
    expect(comps[0]?.name).toBe("Hunters");
    expect(comps[0]?.units).toEqual([{ apiName: "DA_18_Ashe", row: 3, col: 0, star: 2, items: [] }]);
    expect(issues).toEqual([
      "Hunters: Ashe already has Hunter, so Hunter Emblem would add nothing.",
      "Hunters: TFT17_Ahri is not a champion of this set, so it was removed.",
    ]);
  });

  it("keeps another set's comps as stored, but not loadable", () => {
    const old = comp("old", "2026-05-01T10:00:00.000Z", {
      set: "TFTSet17",
      units: [{ apiName: "TFT17_Ahri", row: 0, col: 0, star: 2, items: [] }],
    });
    const { comps, issues } = parseSavedComps(serializeSavedComps([old]), CATALOG, SET);
    expect(comps).toEqual([old]);
    expect(issues).toEqual([]);
    expect(isLoadable(comps[0]!, SET)).toBe(false);
    expect(isLoadable(comp("a", "x"), SET)).toBe(true);
  });

  it("sorts favourites first, then newest, and keeps at most the cap", () => {
    const many = Array.from({ length: MAX_SAVED_COMPS + 2 }, (_, i) =>
      comp(`c${i}`, `2026-09-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z`),
    );
    many[0] = { ...many[0]!, isFavorite: true };
    const { comps, issues } = parseSavedComps(serializeSavedComps(many), CATALOG, SET);
    expect(comps).toHaveLength(MAX_SAVED_COMPS);
    expect(comps[0]?.id).toBe("c0");
    expect(comps[1]!.updatedAt >= comps[2]!.updatedAt).toBe(true);
    expect(issues).toEqual([`Only the first ${MAX_SAVED_COMPS} saved comps are kept.`]);
  });
});

describe("operations", () => {
  const now = "2026-09-14T12:00:00.000Z";

  it("adds a new comp and updates an existing one in place, keeping its favourite", () => {
    let { comps } = saveComp([], { id: "a", name: "First", set: SET, units: BOARD, now });
    comps = toggleFavorite(comps, "a");
    const updated = saveComp(comps, { id: "a", name: "Renamed", set: SET, units: [], now: "2026-09-14T13:00:00.000Z" });
    expect(updated.error).toBeNull();
    expect(updated.comps).toEqual([
      { id: "a", name: "Renamed", set: SET, isFavorite: true, units: [], updatedAt: "2026-09-14T13:00:00.000Z" },
    ]);
  });

  it("cleans names: whitespace, length, and a fallback", () => {
    expect(cleanCompName("  Fast   9  ")).toBe("Fast 9");
    expect(cleanCompName("")).toBe("Untitled comp");
    expect(cleanCompName("x".repeat(100))).toHaveLength(MAX_COMP_NAME);
  });

  it("refuses a new comp past the cap but still updates existing ones", () => {
    const comps = Array.from({ length: MAX_SAVED_COMPS }, (_, i) => comp(`c${i}`, now));
    expect(saveComp(comps, { id: "new", name: "x", set: SET, units: [], now }).error).toMatch(/holds 50 comps/);
    expect(saveComp(comps, { id: "c3", name: "x", set: SET, units: [], now }).error).toBeNull();
    expect(duplicateComp(comps, "c3", "copy", now).error).toMatch(/holds 50 comps/);
  });

  it("duplicates with a new id, a (copy) name, no favourite and a fresh time", () => {
    const source = comp("a", "2026-09-01T00:00:00.000Z", { isFavorite: true, name: "y".repeat(MAX_COMP_NAME) });
    const { comps } = duplicateComp([source], "a", "b", now);
    const copy = comps.find((c) => c.id === "b");
    expect(copy).toMatchObject({ isFavorite: false, updatedAt: now, units: BOARD });
    expect(copy?.name.endsWith(" (copy)")).toBe(true);
    expect(copy?.name).toHaveLength(MAX_COMP_NAME);
    expect(duplicateComp([source], "missing", "b", now).error).toMatch(/no longer exists/);
  });

  it("deletes, and toggles favourites without touching updatedAt", () => {
    const comps = [comp("a", "2026-09-02T00:00:00.000Z"), comp("b", "2026-09-01T00:00:00.000Z")];
    expect(deleteComp(comps, "a").map((c) => c.id)).toEqual(["b"]);
    const pinned = toggleFavorite(comps, "b");
    expect(pinned.map((c) => c.id)).toEqual(["b", "a"]);
    expect(pinned[0]?.updatedAt).toBe("2026-09-01T00:00:00.000Z");
    expect(toggleFavorite(pinned, "b")[0]?.id).toBe("a");
  });
});

describe("draft", () => {
  it("round-trips, and ignores another set's draft or garbage", () => {
    const raw = serializeDraft({ id: "a", name: "WIP", units: BOARD }, SET);
    expect(parseDraft(raw, CATALOG, SET)).toEqual({ id: "a", name: "WIP", units: BOARD });
    expect(parseDraft(raw, CATALOG, "TFTSet19")).toBeNull();
    expect(parseDraft("{", CATALOG, SET)).toBeNull();
    expect(parseDraft(null, CATALOG, SET)).toBeNull();
  });

  it("keeps the name as typed — empty, or with a trailing space mid-word — and caps its length", () => {
    const name = (typed: string) => parseDraft(serializeDraft({ id: null, name: typed, units: [] }, SET), CATALOG, SET)?.name;
    expect(name("")).toBe("");
    expect(name("Fast ")).toBe("Fast ");
    expect(name("z".repeat(100))).toHaveLength(MAX_COMP_NAME);
  });
});
