import { describe, expect, it } from "vitest";
import type { CompStyle, TierRank } from "@/lib/static/game";
import { filterComps, type CompFilter } from "./comp-filter";

const comp = (name: string, tier: TierRank, style: CompStyle, units: string[], traits: string[], items: string[] = []) => ({
  name,
  tier,
  style,
  units: units.map((unit, i) => ({ name: unit, items: i === 0 ? items.map((item) => ({ name: item })) : [] })),
  traits: traits.map((trait) => ({ name: trait })),
});

const comps = [
  comp("Draven Fast 9", "S", "fast9", ["Draven", "Maokai"], ["Elderwood", "Inferno"], ["Guinsoo's Rageblade"]),
  comp("Lunarwood Kha'Zix", "B", "reroll_3", ["Kha'Zix", "Diana"], ["Lunar"]),
  comp("Flora Malphite", "A", "fast8", ["Malphite", "Soraka"], ["Flora Fatalis", "Blackthorn"]),
];

const names = (filter: Partial<CompFilter>) =>
  filterComps(comps, { tiers: new Set(), styles: new Set(), query: "", ...filter }).map((c) => c.name);

describe("filterComps", () => {
  it("keeps everything with no filters, in order", () => {
    expect(names({})).toEqual(["Draven Fast 9", "Lunarwood Kha'Zix", "Flora Malphite"]);
  });

  it("filters by any of the selected tiers and styles", () => {
    expect(names({ tiers: new Set(["S", "A"]) })).toEqual(["Draven Fast 9", "Flora Malphite"]);
    expect(names({ styles: new Set(["reroll_3"]) })).toEqual(["Lunarwood Kha'Zix"]);
    expect(names({ tiers: new Set(["S"]), styles: new Set(["fast8"]) })).toEqual([]);
  });

  it("searches names, style labels, units, items and traits, ignoring case and punctuation", () => {
    expect(names({ query: "khazix" })).toEqual(["Lunarwood Kha'Zix"]);
    expect(names({ query: "SORAKA" })).toEqual(["Flora Malphite"]);
    expect(names({ query: "guinsoo" })).toEqual(["Draven Fast 9"]);
    expect(names({ query: "3-cost reroll" })).toEqual(["Lunarwood Kha'Zix"]);
    expect(names({ query: "flora fatalis" })).toEqual(["Flora Malphite"]);
  });

  it("requires every word to match", () => {
    expect(names({ query: "inferno maokai" })).toEqual(["Draven Fast 9"]);
    expect(names({ query: "inferno soraka" })).toEqual([]);
    expect(names({ query: "   " })).toHaveLength(3);
  });
});
