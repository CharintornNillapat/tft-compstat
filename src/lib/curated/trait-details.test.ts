import { describe, expect, it } from "vitest";
import { buildTraitDetails, parseTraitEffects, pickTraitDetails, traitTiers } from "./trait-details";

describe("parseTraitEffects", () => {
  it("keeps { min, text } entries and drops everything else", () => {
    expect(
      parseTraitEffects([
        { min: 2, text: "20% AD" },
        { min: "3", text: "wrong type" },
        { min: 4, text: "   " },
        null,
        "text",
        { min: 6 },
      ]),
    ).toEqual([{ min: 2, text: "20% AD" }]);
    expect(parseTraitEffects(null)).toEqual([]);
    expect(parseTraitEffects({ min: 2, text: "not a list" })).toEqual([]);
  });
});

describe("traitTiers", () => {
  it("joins breakpoints with their text by unit count", () => {
    expect(
      traitTiers(
        [
          { min: 2, style: "bronze" },
          { min: 4, style: "silver" },
          { min: 6, style: "gold" },
        ],
        [
          { min: 2, text: "25% Health" },
          { min: 6, text: "65% Health" },
        ],
      ),
    ).toEqual([
      { min: 2, style: "bronze", text: "25% Health" },
      { min: 4, style: "silver", text: null },
      { min: 6, style: "gold", text: "65% Health" },
    ]);
  });
});

describe("buildTraitDetails", () => {
  const champion = (apiName: string, name: string, cost: number, traits: string[]) => ({
    apiName,
    name,
    cost,
    iconUrl: null,
    traits,
  });

  const book = buildTraitDetails({
    traits: [
      {
        apiName: "DA_18_Brawler",
        breakpoints: [{ min: 2, style: "bronze" }],
        description: "  Your team gains 120 max Health.  ",
        effects: [{ min: 2, text: "25% Health" }],
      },
      { apiName: "DA_18_LuxUniqueTrait", breakpoints: [{ min: 1, style: "unique" }], description: "   ", effects: [] },
      { apiName: "DA_18_Lonely", breakpoints: [], description: null, effects: [] },
    ],
    champions: [
      champion("DA_18_Sett", "Sett", 4, ["DA_18_Brawler"]),
      champion("DA_18_Gnar", "Gnar", 1, ["DA_18_Brawler", "DA_18_Brawler"]),
      champion("DA_18_Alistar", "Alistar", 1, ["DA_18_Brawler"]),
      champion("DA_Lux18_Wind", "Lux", 5, ["DA_18_LuxUniqueTrait"]),
      champion("DA_Lux18_Base", "Lux", 5, ["DA_18_LuxUniqueTrait"]),
    ],
  });

  it("lists every member cheapest first, then by name, once each", () => {
    expect(book.DA_18_Brawler?.members.map((member) => member.name)).toEqual(["Alistar", "Gnar", "Sett"]);
  });

  it("lists a champion's forms once per name and cost", () => {
    expect(book.DA_18_LuxUniqueTrait?.members).toEqual([
      { apiName: "DA_Lux18_Base", name: "Lux", cost: 5, iconUrl: null },
    ]);
  });

  it("trims the description to null when blank, and keeps traits nobody has", () => {
    expect(book.DA_18_Brawler?.description).toBe("Your team gains 120 max Health.");
    expect(book.DA_18_LuxUniqueTrait?.description).toBeNull();
    expect(book.DA_18_Lonely).toEqual({ description: null, tiers: [], members: [] });
  });

  it("picks only the traits a page names, ignoring unknown ones", () => {
    expect(Object.keys(pickTraitDetails(book, ["DA_18_Brawler", "DA_18_Missing"]))).toEqual(["DA_18_Brawler"]);
  });
});
