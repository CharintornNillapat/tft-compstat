import { describe, expect, it } from "vitest";
import { buildTraitDetails, cleanStatText, parseTraitEffects, pickTraitDetails, traitTiers } from "./trait-details";

describe("cleanStatText", () => {
  it("rounds float noise to at most two decimals and drops a trailing .0", () => {
    expect(cleanStatText("+7.00001% Attack Speed")).toBe("+7% Attack Speed");
    expect(cleanStatText("7.999999% AD")).toBe("8% AD");
    expect(cleanStatText("0.10000000149 AP")).toBe("0.1 AP");
    expect(cleanStatText("Stun for 1.33333 seconds")).toBe("Stun for 1.33 seconds");
    expect(cleanStatText("Lasts 3.0 seconds, 2.00 times")).toBe("Lasts 3 seconds, 2 times");
  });

  it("leaves real decimals, versions and plain numbers alone", () => {
    expect(cleanStatText("12.5% Health and 1.25 mana")).toBe("12.5% Health and 1.25 mana");
    expect(cleanStatText("Patch 16.18, 3 stacks, 1.2.3")).toBe("Patch 16.18, 3 stacks, 1.2.3");
  });
});

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
    expect(book.DA_18_Lonely).toEqual({ kind: null, description: null, tiers: [], members: [] });
  });

  it("carries the trait type, and cleans float noise out of every stat line", () => {
    const typed = buildTraitDetails({
      traits: [
        {
          apiName: "DA_18_Rapidfire",
          breakpoints: [{ min: 2, style: "bronze" }],
          description: "Your team gains 10.000000149% Attack Speed.",
          effects: [{ min: 2, text: "+7.00001% Attack Speed per Attack" }],
          kind: "class",
        },
      ],
      champions: [],
    });
    expect(typed.DA_18_Rapidfire).toMatchObject({
      kind: "class",
      description: "Your team gains 10% Attack Speed.",
      tiers: [{ min: 2, style: "bronze", text: "+7% Attack Speed per Attack" }],
    });
  });

  it("picks only the traits a page names, ignoring unknown ones", () => {
    expect(Object.keys(pickTraitDetails(book, ["DA_18_Brawler", "DA_18_Missing"]))).toEqual(["DA_18_Brawler"]);
  });
});
