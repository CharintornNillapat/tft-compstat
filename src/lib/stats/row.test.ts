import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { matchSchema } from "@/lib/riot/schemas";
import type { TraitBreakpoint } from "@/lib/static/game";
import type { NameBook } from "@/lib/static/names";
import { derivePlayerMatch, type StaticLookup } from "@/lib/sync/derive";
import type { Tables } from "@/lib/supabase/types";
import { matchRow } from "./__fixtures__/rows";
import { carryItems, matchTraits, namesUsedBy, toMatchRow } from "./row";

/**
 * The same real Set 18 game `derive.test.ts` uses (SG2_173695822, puuids replaced).
 * Running it through `derivePlayerMatch` → `toMatchRow` is what proves the whole
 * mapper chain against real data rather than against hand-written rows — including
 * the awkward cases Phase 4 found live: Riftbeast units, and 13 items on the board.
 */
const raw: unknown = JSON.parse(readFileSync("src/lib/sync/__fixtures__/match.json", "utf8"));
const dto = matchSchema.parse(raw);
const ME = "PUUID_ME";

const BREAKPOINTS: Record<string, TraitBreakpoint[]> = {
  DA_18_Battlemage: [{ min: 1, style: "unique" }],
  DA_18_Caustic: [{ min: 1, style: "unique" }],
  DA_18_Blackthorn: [{ min: 2, style: "bronze" }, { min: 4, style: "silver" }, { min: 6, style: "gold" }],
  DA_18_Brawler: [{ min: 2, style: "bronze" }, { min: 4, style: "silver" }, { min: 6, style: "gold" }],
  DA_18_Adaptor: [{ min: 2, style: "bronze" }, { min: 3, style: "silver" }, { min: 4, style: "gold" }],
  DA_18_Hunter: [
    { min: 2, style: "bronze" }, { min: 3, style: "silver" }, { min: 4, style: "silver" }, { min: 5, style: "gold" },
  ],
  DA_18_Invoker: [
    { min: 2, style: "bronze" }, { min: 3, style: "silver" }, { min: 4, style: "silver" }, { min: 5, style: "gold" },
  ],
  DA_Primal18: [{ min: 2, style: "bronze" }, { min: 4, style: "gold" }],
  DA_Riftbeast18: [
    { min: 3, style: "bronze" }, { min: 5, style: "silver" }, { min: 7, style: "gold" }, { min: 10, style: "gold" },
  ],
  DA_18_Slayer: [{ min: 2, style: "bronze" }, { min: 4, style: "silver" }, { min: 6, style: "gold" }],
  DA_18_Vanguard: [{ min: 2, style: "bronze" }, { min: 4, style: "silver" }, { min: 6, style: "gold" }],
};

const COSTS: Record<string, number> = {
  DA_18_RekSai: 3, DA_Nidalee18_AP: 2, DA_Sentinel18: 4, DA_Krug18: 3,
  DA_18_Sivir: 4, DA_KogMaw18_AD: 1, DA_18_Malphite: 2, DA_Cinderling18: 1,
};

const lookup: StaticLookup = {
  championCost: (apiName) => COSTS[apiName],
  traitBreakpoints: (apiName) => BREAKPOINTS[apiName],
};

/** Exactly what the sync writes, then read back the way Supabase returns it. */
const stored = derivePlayerMatch(dto, ME, lookup) as Tables<"player_matches">;
const row = toMatchRow(stored);

describe("toMatchRow on the real match", () => {
  it("carries the scalar fields across under their camelCase names", () => {
    expect(row).toMatchObject({
      matchId: "SG2_173695822",
      queueId: 1100,
      setNumber: 18,
      placement: 7,
      carryUnit: "DA_18_Sivir",
      compKey: "DA_18_Sivir|DA_18_Hunter+DA_Riftbeast18",
      primaryTraits: ["DA_18_Hunter", "DA_Riftbeast18"],
    });
    expect(row.playedAt).toBe("2026-09-06T15:32:52.070Z");
  });

  it("re-narrows the jsonb columns into usable objects rather than Json", () => {
    expect(row.units).toHaveLength(8);
    expect(row.units.map((unit) => unit.character_id)).toContain("DA_Krug18");
    expect(row.traits.every((trait) => typeof trait.num_units === "number")).toBe(true);
  });

  it("tolerates null jsonb without throwing", () => {
    const empty = toMatchRow({ ...stored, traits: null as never, units: null as never });
    expect(empty.traits).toEqual([]);
    expect(empty.units).toEqual([]);
  });
});

describe("carryItems", () => {
  it("returns the carry's own items", () => {
    // Sivir was one of the four units holding three items.
    expect(carryItems(row)).toHaveLength(3);
  });

  it("returns nothing for a bust-out with no carry", () => {
    expect(carryItems(matchRow({ placement: 8 }))).toEqual([]);
  });

  it("returns nothing when the carry is somehow not on the board", () => {
    expect(carryItems({ ...row, carryUnit: "DA_18_Nobody" })).toEqual([]);
  });
});

describe("namesUsedBy", () => {
  it("collects every champion, trait and item the rows reference", () => {
    const used = namesUsedBy([row]);
    expect(used.champions).toContain("DA_18_Sivir");
    expect(used.champions).toContain("DA_Sentinel18");
    expect(used.traits).toContain("DA_18_Hunter");
    // 13 items across the board, deduplicated.
    expect(used.items.length).toBeGreaterThan(0);
    expect(new Set(used.items).size).toBe(used.items.length);
  });

  it("deduplicates across rows", () => {
    expect(namesUsedBy([row, row]).champions).toEqual(namesUsedBy([row]).champions);
  });

  it("is empty for no rows", () => {
    expect(namesUsedBy([])).toEqual({ champions: [], traits: [], items: [] });
  });
});

describe("matchTraits", () => {
  const names: NameBook = {
    champions: {},
    traits: {
      DA_18_Hunter: { name: "Hunter", iconUrl: "hunter.png" },
      DA_Riftbeast18: { name: "Riftbeast", iconUrl: null },
    },
    items: {},
  };

  it("resolves display names, so the dashboard never shows a raw api name", () => {
    const traits = matchTraits(row, names);
    expect(traits.find((t) => t.apiName === "DA_18_Hunter")).toMatchObject({
      name: "Hunter",
      iconUrl: "hunter.png",
      style: "silver",
    });
  });

  it("falls back to the api name for a trait the static tables don't know", () => {
    expect(matchTraits(row, names).find((t) => t.apiName === "DA_18_Brawler")?.name).toBe("DA_18_Brawler");
  });

  it("orders by style strongest first, then by unit count", () => {
    const styles = matchTraits(row, names).map((t) => t.style);
    // Silver Hunter leads the bronzes; the two uniques sort last, as in game.
    expect(styles[0]).toBe("silver");
    expect(styles.at(-1)).toBe("unique");
    expect(styles.filter((s) => s === "bronze").length).toBeGreaterThan(0);
  });
});
