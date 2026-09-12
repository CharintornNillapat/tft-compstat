import { describe, expect, it } from "vitest";
import type { TierRank } from "@/lib/static/game";
import { groupChampionsByCost } from "./champion-groups";

/** `S:Ashe/1` reads as "Ashe, a 1-cost, rated S". */
const entry = (name: string, cost: number) => ({ name, cost });

const tiers = (spec: Record<string, [string, number][]>) =>
  Object.entries(spec).map(([tier, units]) => ({
    tier: tier as TierRank,
    entries: units.map(([name, cost]) => entry(name, cost)),
  }));

const rows = (groups: { cost: number; entries: { name: string }[] }[]) =>
  groups.map((group) => [group.cost, group.entries.map((e) => e.name)] as const);

describe("groupChampionsByCost", () => {
  it("buckets by cost and emits 1 through 5 even when a cost is empty", () => {
    expect(rows(groupChampionsByCost(tiers({ S: [["Ashe", 5]], B: [["Sett", 1]] })))).toEqual([
      [1, ["Sett"]],
      [2, []],
      [3, []],
      [4, []],
      [5, ["Ashe"]],
    ]);
  });

  it("keeps the strongest first, then the author's order inside a tier", () => {
    // The query hands tiers over S→C with each already in YAML `position` order,
    // so a stable bucketing is the whole sort. Kennen before Sivir is the file's
    // own ranking within S, and it must survive.
    const groups = groupChampionsByCost(
      tiers({
        S: [["Kennen", 1], ["Sivir", 1]],
        A: [["Maokai", 1]],
        C: [["Teemo", 1], ["Rakan", 1]],
      }),
    );
    expect(rows(groups)[0]).toEqual([1, ["Kennen", "Sivir", "Maokai", "Teemo", "Rakan"]]);
  });

  it("gives an unexpected cost its own trailing row rather than dropping it", () => {
    // The DB check constrains cost, so this should be unreachable — but a champion
    // vanishing from the page is a far worse failure than an odd extra row.
    expect(rows(groupChampionsByCost(tiers({ S: [["Ashe", 5], ["Mystery", 7]] })))).toEqual([
      [1, []],
      [2, []],
      [3, []],
      [4, []],
      [5, ["Ashe"]],
      [7, ["Mystery"]],
    ]);
  });

  it("returns five empty rows for an empty list", () => {
    expect(rows(groupChampionsByCost<ReturnType<typeof entry>>([]))).toEqual([
      [1, []],
      [2, []],
      [3, []],
      [4, []],
      [5, []],
    ]);
  });
});
