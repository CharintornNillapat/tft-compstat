import { describe, expect, it } from "vitest";
import { matchRow } from "./__fixtures__/rows";
import {
  curatedPerformance,
  matchCuratedComp,
  matchCuratedComps,
  type CuratedCompCarry,
  type CuratedCompShape,
} from "./curated-match";

const shape = (overrides: Partial<CuratedCompShape> & { slug: string; coreUnits: string[] }): CuratedCompShape => ({
  name: overrides.slug,
  tier: "A",
  setId: 18,
  carries: [],
  ...overrides,
});

const carry = (apiName: string, priority: number | null = null): CuratedCompCarry => ({ apiName, priority });

/**
 * A five-unit curated comp, so a "3 of 5" board sits exactly on the 60% threshold.
 * Its stated carry matches architecture §6.2's own YAML example (`carry: true,
 * priority: 1` on the Draven unit).
 */
const draven = shape({
  slug: "draven-fast-9",
  name: "Draven Fast 9",
  tier: "S",
  coreUnits: ["DA_Draven18", "DA_18_Sivir", "DA_18_Maokai", "DA_18_Shen", "DA_18_Ahri"],
  carries: [carry("DA_Draven18", 1)],
});

const board = (units: string[], overrides: Partial<Parameters<typeof matchRow>[0]> = {}) =>
  matchRow({
    placement: 4,
    units: units.map((character_id) => ({ character_id, star: 2, items: [] })),
    ...overrides,
  });

describe("matchCuratedComp", () => {
  it("matches a board holding 60% of the comp's core units", () => {
    const match = matchCuratedComp(board(["DA_Draven18", "DA_18_Sivir", "DA_18_Maokai"]), [draven]);
    expect(match).toEqual({
      slug: "draven-fast-9",
      name: "Draven Fast 9",
      tier: "S",
      overlap: 0.6,
      matched: 3,
      core: 5,
    });
  });

  it("does not match one unit short of the threshold", () => {
    expect(matchCuratedComp(board(["DA_Draven18", "DA_18_Sivir"]), [draven])).toBeNull();
  });

  it("ignores board units the comp does not ask for", () => {
    // Nine units fielded, only three of them the comp's: the share is of the comp's
    // core, not of the board, so padding a board can never dilute a match.
    const units = [...draven.coreUnits.slice(0, 3), "X1", "X2", "X3", "X4", "X5", "X6"];
    expect(matchCuratedComp(board(units), [draven])?.overlap).toBe(0.6);
  });

  it("never matches a comp from another set", () => {
    const lastSet = shape({ slug: "old", setId: 17, coreUnits: draven.coreUnits });
    expect(matchCuratedComp(board(draven.coreUnits), [lastSet])).toBeNull();
  });

  it("returns null for a bust-out with no units at all", () => {
    expect(matchCuratedComp(board([]), [draven])).toBeNull();
  });

  it("prefers the higher overlap", () => {
    const partial = shape({ slug: "partial", coreUnits: [...draven.coreUnits.slice(0, 3), "X1"] });
    const match = matchCuratedComp(board(draven.coreUnits), [partial, draven]);
    expect(match?.slug).toBe("draven-fast-9");
    expect(match?.overlap).toBe(1);
  });

  it("breaks an equal overlap on the larger comp, then on the slug", () => {
    const units = ["A", "B", "C", "D"];
    const small = shape({ slug: "small", coreUnits: ["A", "B"] });
    const large = shape({ slug: "large", coreUnits: units });
    // Both are fully present; the longer comp is the more specific claim.
    expect(matchCuratedComp(board(units), [small, large])?.slug).toBe("large");

    const twin = shape({ slug: "a-twin", coreUnits: units });
    expect(matchCuratedComp(board(units), [large, twin])?.slug).toBe("a-twin");
  });

  it("honours a caller's threshold", () => {
    const half = board(["DA_Draven18", "DA_18_Sivir"]);
    expect(matchCuratedComp(half, [draven], 0.4)?.overlap).toBe(0.4);
    expect(matchCuratedComp(board(draven.coreUnits), [draven], 1)?.overlap).toBe(1);
  });
});

describe("matchCuratedComp — carry gate and weighting (Task 31)", () => {
  // Reproduces the failure that motivated this: a Hecarim-only board read as
  // "Vanguard Kha'Zix" at 71%, sharing 5 of 7 board units, none of them Kha'Zix —
  // the comp's own stated priority-1 carry (data/curated/18/comps/vanguard-khazix.yaml).
  const vanguardKhazix = shape({
    slug: "vanguard-khazix",
    name: "Vanguard Kha'Zix",
    coreUnits: [
      "DA_18_KhaZix",
      "DA_18_Hecarim",
      "DA_18_Diana",
      "DA_Fiddlesticks18",
      "DA_18_Ezreal",
      "DA_18_Ornn",
      "DA_18_Soraka",
    ],
    carries: [carry("DA_18_KhaZix", 1), carry("DA_18_Hecarim", 2)],
  });

  it("rejects a comp when its stated primary carry never made the board, however high the overlap", () => {
    const hecarimOnly = board(["DA_18_Hecarim", "DA_18_Diana", "DA_Fiddlesticks18", "DA_18_Ezreal", "DA_18_Ornn"]);
    // 5 of 7 = 71%, clears the threshold, but Kha'Zix itself is absent.
    expect(matchCuratedComp(hecarimOnly, [vanguardKhazix])).toBeNull();
  });

  it("matches once the primary carry is on the board, even swapping out a support unit", () => {
    const khazixBuilt = board(["DA_18_KhaZix", "DA_18_Diana", "DA_Fiddlesticks18", "DA_18_Ezreal", "DA_18_Ornn"]);
    expect(matchCuratedComp(khazixBuilt, [vanguardKhazix])?.slug).toBe("vanguard-khazix");
  });

  it("falls back to requiring any stated carry when none of them states priority 1", () => {
    const flex = shape({ slug: "flex-carry", coreUnits: ["A", "B", "C", "D", "E"], carries: [carry("A"), carry("B")] });
    // Support alone clears 60% but touches neither stated carry.
    expect(matchCuratedComp(board(["C", "D", "E"]), [flex])).toBeNull();
    // Either carry is enough once one of them is actually built.
    expect(matchCuratedComp(board(["A", "C", "D"]), [flex])?.slug).toBe("flex-carry");
  });

  it("skips the gate for a comp with no stated carry at all, a data gap rather than a real state", () => {
    const noCarryData = shape({ slug: "legacy", coreUnits: ["A", "B", "C", "D", "E"] });
    expect(matchCuratedComp(board(["A", "B", "C"]), [noCarryData])?.slug).toBe("legacy");
  });

  it("breaks an overlap tie toward the comp whose matched units weigh more toward its own carries", () => {
    const heavy = shape({
      // Alphabetically last, so a slug-only tie-break would lose this comp — proves
      // the win comes from the weighting, not from the pre-existing tie-break chain.
      slug: "zzz-heavy-carry",
      coreUnits: ["CarryX", "SecondaryX", "S1", "S2", "S3"],
      carries: [carry("CarryX", 1), carry("SecondaryX", 2)],
    });
    const light = shape({
      slug: "aaa-light-carry",
      coreUnits: ["CarryY", "T1", "T2", "T3", "T4"],
      carries: [carry("CarryY", 1)],
    });
    // Both sit at exactly 3 of 5 (60%): heavy's three include its primary AND
    // secondary carry; light's three include only its (lone) carry.
    const shared = board(["CarryX", "SecondaryX", "S1", "CarryY", "T1", "T2"]);
    expect(matchCuratedComp(shared, [heavy, light])?.slug).toBe("zzz-heavy-carry");
  });
});

describe("matchCuratedComps", () => {
  it("keys matched rows by match id and leaves unmatched rows out", () => {
    const rows = [
      board(draven.coreUnits, { matchId: "SG2_1" }),
      board(["X1", "X2"], { matchId: "SG2_2" }),
    ];
    const matches = matchCuratedComps(rows, [draven]);
    expect([...matches.keys()]).toEqual(["SG2_1"]);
  });
});

describe("curatedPerformance", () => {
  const rows = [
    board(draven.coreUnits, { matchId: "SG2_1", placement: 1 }),
    board(draven.coreUnits, { matchId: "SG2_2", placement: 3 }),
    board(draven.coreUnits, { matchId: "SG2_3", placement: 8 }),
    board(["X1", "X2"], { matchId: "SG2_4", placement: 2 }),
  ];

  it("averages placement and top 4 over a comp's matched games only", () => {
    const performance = curatedPerformance(rows, matchCuratedComps(rows, [draven]));
    expect(performance.comps).toEqual([
      { slug: "draven-fast-9", name: "Draven Fast 9", tier: "S", games: 3, avgPlacement: 4, top4Rate: 2 / 3 },
    ]);
    // The unmatched 2nd place counts in `games` but not in the comp's record.
    expect(performance).toMatchObject({ matchedGames: 3, games: 4 });
  });

  it("sorts by games, then average placement, then name", () => {
    const other = shape({ slug: "shen-reroll", name: "Shen Reroll", coreUnits: ["Y1", "Y2"] });
    const extra = [
      board(["Y1", "Y2"], { matchId: "SG2_5", placement: 2 }),
      board(["Y1", "Y2"], { matchId: "SG2_6", placement: 2 }),
      board(["Y1", "Y2"], { matchId: "SG2_7", placement: 2 }),
    ];
    const all = [...rows, ...extra];
    const performance = curatedPerformance(all, matchCuratedComps(all, [draven, other]));
    expect(performance.comps.map((comp) => comp.slug)).toEqual(["shen-reroll", "draven-fast-9"]);
  });

  it("reports nothing rather than zeroes when no game matched", () => {
    const none = [board(["X1"], { matchId: "SG2_9", placement: 5 })];
    expect(curatedPerformance(none, matchCuratedComps(none, [draven]))).toEqual({
      comps: [],
      matchedGames: 0,
      games: 1,
    });
  });
});
