import { describe, expect, it } from "vitest";
import { buildTeamCode } from "@/lib/curated/team-code";
import { computeActiveTraits } from "@/lib/curated/traits";
import {
  equipItem,
  isHex,
  moveUnit,
  placeUnit,
  plannerOrder,
  removeUnit,
  sanitizeBoard,
  setStar,
  toPlannerUnits,
  toTraitUnits,
  unequipItem,
  unitAt,
  type Board,
} from "./board";
import { CATALOG, TRAITS } from "./catalog.fixture";

const place = (board: Board, apiName: string, row: number, col: number) => {
  const result = placeUnit(board, apiName, { row, col }, CATALOG);
  expect(result.error).toBeNull();
  return result.board;
};

describe("isHex", () => {
  it("accepts the 4×7 board only", () => {
    expect(isHex({ row: 0, col: 0 })).toBe(true);
    expect(isHex({ row: 3, col: 6 })).toBe(true);
    for (const hex of [
      { row: 4, col: 0 },
      { row: 0, col: 7 },
      { row: -1, col: 0 },
      { row: 1.5, col: 2 },
    ]) {
      expect(isHex(hex)).toBe(false);
    }
  });
});

describe("placeUnit", () => {
  it("places a champion at 2 stars with no items", () => {
    const board = place([], "DA_18_Ashe", 3, 0);
    expect(board).toEqual([{ apiName: "DA_18_Ashe", row: 3, col: 0, star: 2, items: [] }]);
  });

  it("places Riftbeasts and planner-less units like any champion", () => {
    const board = place(place([], "DA_18_Sentry", 0, 3), "DA_Lux18_Wind", 3, 3);
    expect(board.map((unit) => unit.apiName)).toEqual(["DA_18_Sentry", "DA_Lux18_Wind"]);
  });

  it("moves a champion already on the board instead of adding a second copy", () => {
    let board = place([], "DA_18_Ashe", 3, 0);
    board = equipItem(board, { row: 3, col: 0 }, "DA_InfinityEdge", CATALOG).board;
    board = place(board, "DA_18_Ashe", 2, 4);
    expect(board).toHaveLength(1);
    expect(board[0]).toMatchObject({ row: 2, col: 4, items: ["DA_InfinityEdge"] });
  });

  it("replaces a different unit on the hex", () => {
    const board = place(place([], "DA_18_Ornn", 0, 0), "DA_18_Sivir", 0, 0);
    expect(board.map((unit) => unit.apiName)).toEqual(["DA_18_Sivir"]);
  });

  it("allows every hex to be filled, past the ten a team code holds", () => {
    const names = Object.keys(CATALOG.champions);
    const many = { ...CATALOG, champions: { ...CATALOG.champions } };
    for (let i = 0; i < 28; i++) {
      many.champions[`X${i}`] = { apiName: `X${i}`, name: `X${i}`, cost: 1, iconUrl: null, traits: [], plannerCode: 1 };
    }
    let board: Board = [];
    for (let i = 0; i < 28; i++) board = placeUnit(board, `X${i}`, { row: Math.floor(i / 7), col: i % 7 }, many).board;
    expect(board).toHaveLength(28);
    expect(names.length).toBeGreaterThan(0);
  });

  it("refuses unknown champions and off-board hexes, keeping the board", () => {
    const board = place([], "DA_18_Ashe", 3, 0);
    expect(placeUnit(board, "DA_Nope", { row: 0, col: 0 }, CATALOG)).toEqual({ board, error: "Unknown champion DA_Nope." });
    expect(placeUnit(board, "DA_18_Sivir", { row: 4, col: 0 }, CATALOG).error).toMatch(/off the board/);
  });
});

describe("moveUnit and removeUnit", () => {
  it("moves to an empty hex and swaps with an occupied one", () => {
    let board = place(place([], "DA_18_Ashe", 3, 0), "DA_18_Ornn", 0, 3);
    board = moveUnit(board, { row: 3, col: 0 }, { row: 3, col: 6 }).board;
    expect(unitAt(board, { row: 3, col: 6 })?.apiName).toBe("DA_18_Ashe");
    board = moveUnit(board, { row: 3, col: 6 }, { row: 0, col: 3 }).board;
    expect(unitAt(board, { row: 0, col: 3 })?.apiName).toBe("DA_18_Ashe");
    expect(unitAt(board, { row: 3, col: 6 })?.apiName).toBe("DA_18_Ornn");
  });

  it("reports a move or removal from an empty hex", () => {
    expect(moveUnit([], { row: 0, col: 0 }, { row: 1, col: 1 }).error).toMatch(/no unit/);
    expect(removeUnit([], { row: 0, col: 0 }).error).toMatch(/no unit/);
  });

  it("removes a unit", () => {
    const board = place(place([], "DA_18_Ashe", 3, 0), "DA_18_Ornn", 0, 3);
    expect(removeUnit(board, { row: 3, col: 0 }).board.map((unit) => unit.apiName)).toEqual(["DA_18_Ornn"]);
  });
});

describe("setStar", () => {
  it("sets 1-3 and nothing else", () => {
    const board = place([], "DA_18_Ashe", 3, 0);
    expect(setStar(board, { row: 3, col: 0 }, 3).board[0]?.star).toBe(3);
    expect(setStar(board, { row: 3, col: 0 }, 4).error).toMatch(/1, 2 or 3/);
    expect(setStar(board, { row: 0, col: 0 }, 1).error).toMatch(/no unit/);
  });
});

describe("equipItem and unequipItem", () => {
  const ashe = { row: 3, col: 0 };

  it("holds at most three items, duplicates of a completed item allowed", () => {
    let board = place([], "DA_18_Ashe", 3, 0);
    for (const item of ["DA_InfinityEdge", "DA_InfinityEdge", "DA_Artifact_Fishbones"]) {
      board = equipItem(board, ashe, item, CATALOG).board;
    }
    expect(board[0]?.items).toHaveLength(3);
    expect(equipItem(board, ashe, "DA_Deathblade", CATALOG).error).toBe("Ashe already holds 3 items.");
  });

  it("refuses an emblem for a trait the champion has", () => {
    const board = place([], "DA_18_Ashe", 3, 0);
    expect(equipItem(board, ashe, "DA_18_EmblemHunter", CATALOG).error).toBe(
      "Ashe already has Hunter, so Hunter Emblem would add nothing.",
    );
  });

  it("refuses a second emblem of the same trait", () => {
    let board = place([], "DA_18_Ornn", 0, 0);
    board = equipItem(board, { row: 0, col: 0 }, "DA_18_EmblemHunter", CATALOG).board;
    expect(board[0]?.items).toEqual(["DA_18_EmblemHunter"]);
    expect(equipItem(board, { row: 0, col: 0 }, "DA_18_EmblemHunter", CATALOG).error).toMatch(/already has Hunter/);
  });

  it("needs a unit and a known item", () => {
    expect(equipItem([], ashe, "DA_InfinityEdge", CATALOG).error).toMatch(/Select a unit/);
    expect(equipItem(place([], "DA_18_Ashe", 3, 0), ashe, "DA_Nope", CATALOG).error).toBe("Unknown item DA_Nope.");
  });

  it("removes the item in a slot", () => {
    let board = place([], "DA_18_Ashe", 3, 0);
    board = equipItem(board, ashe, "DA_InfinityEdge", CATALOG).board;
    board = equipItem(board, ashe, "DA_Deathblade", CATALOG).board;
    expect(unequipItem(board, ashe, 0).board[0]?.items).toEqual(["DA_Deathblade"]);
    expect(unequipItem(board, ashe, 5).error).toMatch(/No item/);
  });
});

describe("sanitizeBoard", () => {
  it("keeps a valid board untouched", () => {
    const units = [{ apiName: "DA_18_Ashe", row: 3, col: 0, star: 3, items: ["DA_InfinityEdge"] }];
    expect(sanitizeBoard(units, CATALOG)).toEqual({ board: units, issues: [] });
  });

  it("drops what the editor would refuse and says why", () => {
    const { board, issues } = sanitizeBoard(
      [
        { apiName: "TFT17_Ahri", row: 0, col: 0, star: 2, items: [] },
        { apiName: "DA_18_Sivir", row: 9, col: 0, star: 2, items: [] },
        { apiName: "DA_18_Ashe", row: 3, col: 0, star: 7, items: ["DA_18_EmblemHunter", "DA_Gone", "DA_InfinityEdge"] },
        { apiName: "DA_18_Ashe", row: 3, col: 1, star: 2, items: [] },
        { apiName: "DA_18_Ornn", row: 3, col: 0, star: 2, items: [] },
      ],
      CATALOG,
    );
    expect(board).toEqual([{ apiName: "DA_18_Ashe", row: 3, col: 0, star: 2, items: ["DA_InfinityEdge"] }]);
    expect(issues).toEqual([
      "TFT17_Ahri is not a champion of this set, so it was removed.",
      "Sivir was off the board, so it was removed.",
      "Ashe already has Hunter, so Hunter Emblem would add nothing.",
      "Ashe: unknown item DA_Gone was removed.",
      "Ashe was on the board twice; the second copy was removed.",
      "Ornn shared a hex with Ashe, so it was removed.",
    ]);
  });
});

describe("team code and traits", () => {
  const board = (() => {
    let b = place(place(place([], "DA_18_Ornn", 0, 0), "DA_18_Sivir", 3, 5), "DA_18_Ashe", 3, 0);
    b = equipItem(b, { row: 3, col: 5 }, "DA_InfinityEdge", CATALOG).board;
    b = equipItem(b, { row: 0, col: 0 }, "DA_18_EmblemHunter", CATALOG).board;
    b = equipItem(b, { row: 3, col: 5 }, "DA_Deathblade", CATALOG).board;
    return place(b, "DA_Lux18_Wind", 2, 2);
  })();

  it("orders units by items, then cost, then back row first", () => {
    expect(plannerOrder(board, CATALOG).map((unit) => unit.apiName)).toEqual([
      "DA_18_Sivir", // 2 items
      "DA_18_Ornn", // 1 item
      "DA_18_Ashe", // 5-cost, back row
      "DA_Lux18_Wind", // 5-cost, row 2
    ]);
  });

  it("feeds buildTeamCode in that order and skips the Lux form", () => {
    const code = buildTeamCode(toPlannerUnits(board, CATALOG), "TFTSet18");
    // Sivir 1068 = 0x42c, Ornn 1055 = 0x41f, Ashe 1008 = 0x3f0.
    expect(code?.code).toBe(`0242c41f3f0${"000".repeat(7)}TFTSet18`);
    expect(code?.skipped).toEqual([{ name: "Lux", reason: "no-code" }]);
  });

  it("counts emblems toward traits through computeActiveTraits", () => {
    const traits = computeActiveTraits(toTraitUnits(board, CATALOG), TRAITS);
    const byName = Object.fromEntries(traits.map((trait) => [trait.name, [trait.count, trait.style]]));
    expect(byName.Hunter).toEqual([3, "silver"]); // Ashe, Sivir and Ornn's emblem
    expect(byName.Invoker).toEqual([1, null]);
    expect(byName.Blossom).toEqual([1, "unique"]);
  });
});
