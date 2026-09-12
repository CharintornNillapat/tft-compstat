import { describe, expect, it } from "vitest";
import { matchRow } from "./__fixtures__/rows";
import { topChampions, topItems } from "./champions";
import type { MatchRow } from "./types";

const board = (placement: number, units: [string, string[]][]): MatchRow =>
  matchRow({ placement, units: units.map(([character_id, items]) => ({ character_id, star: 2, items })) });

describe("topChampions", () => {
  it("counts a champion once per match even when it is fielded twice", () => {
    const rows = [board(2, [["Sivir", []], ["Sivir", []]])];
    expect(topChampions(rows, { minGames: 1 })).toEqual([{ apiName: "Sivir", games: 1, avgPlacement: 2 }]);
  });

  it("averages placement across the matches a unit appeared in", () => {
    const rows = [board(1, [["Sivir", []]]), board(5, [["Sivir", []], ["Jinx", []]])];
    expect(topChampions(rows, { minGames: 1 })).toEqual([
      { apiName: "Sivir", games: 2, avgPlacement: 3 },
      { apiName: "Jinx", games: 1, avgPlacement: 5 },
    ]);
  });

  it("sorts by average placement, best first", () => {
    const rows = [board(1, [["Good", []]]), board(8, [["Bad", []]]), board(1, [["Good", []]]), board(8, [["Bad", []]])];
    expect(topChampions(rows).map((s) => s.apiName)).toEqual(["Good", "Bad"]);
  });

  it("hides units below minGames, which defaults to 2", () => {
    const rows = [board(1, [["Once", []]]), board(1, [["Twice", []]]), board(2, [["Twice", []]])];
    expect(topChampions(rows).map((s) => s.apiName)).toEqual(["Twice"]);
    // Once averages 1.0 and Twice 1.5, so relaxing minGames puts Once in front.
    expect(topChampions(rows, { minGames: 1 }).map((s) => s.apiName)).toEqual(["Once", "Twice"]);
  });
});

describe("topItems", () => {
  it("counts an item once per match even when two copies are built", () => {
    const rows = [board(3, [["Sivir", ["Deathblade", "Deathblade"]], ["Jinx", ["Deathblade"]]])];
    expect(topItems(rows, { minGames: 1 })).toEqual([{ apiName: "Deathblade", games: 1, avgPlacement: 3 }]);
  });

  it("gathers items from every unit on the board", () => {
    const rows = [board(1, [["Sivir", ["IE"]], ["Jinx", ["JG"]]]), board(3, [["Sivir", ["IE"]]])];
    expect(topItems(rows, { minGames: 1 })).toEqual([
      { apiName: "JG", games: 1, avgPlacement: 1 },
      { apiName: "IE", games: 2, avgPlacement: 2 },
    ]);
  });

  it("returns nothing for boards with no items", () => {
    expect(topItems([board(8, [["Sivir", []]])], { minGames: 1 })).toEqual([]);
  });
});
