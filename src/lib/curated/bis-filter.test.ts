import { describe, expect, it } from "vitest";
import type { BisChampion, BisItem } from "./bis";
import { filterBisChampions } from "./bis-filter";

const sampleItem = (name: string, components: string[] = []): BisItem => ({
  apiName: `TFT_${name.replace(/\s+/g, "")}`,
  name,
  iconUrl: null,
  components: components.map((c) => ({ name: c, iconUrl: null })),
  grantsTrait: null,
  kind: null,
});

const sampleChampions: BisChampion[] = [
  {
    apiName: "DA_18_Draven",
    name: "Draven",
    cost: 5,
    iconUrl: null,
    role: "AD Carry",
    primary: [sampleItem("Infinity Edge", ["B.F. Sword", "Sparring Gloves"]), sampleItem("Last Whisper", ["Recurve Bow", "Sparring Gloves"]), sampleItem("Bloodthirster", ["B.F. Sword", "Negatron Cloak"])],
    secondary: [sampleItem("Giant Slayer", ["B.F. Sword", "Recurve Bow"])],
    special: [sampleItem("Radiant Infinity Edge")],
    avgPlace: 4.1,
    games: 5000,
    notes: "Best fast 9 carry",
  },
  {
    apiName: "DA_18_Amumu",
    name: "Amumu",
    cost: 1,
    iconUrl: null,
    role: "Main Tank",
    primary: [sampleItem("Warmog's Armor", ["Giant's Belt", "Giant's Belt"]), sampleItem("Dragons Claw", ["Negatron Cloak", "Negatron Cloak"]), sampleItem("Bramble Vest", ["Chain Vest", "Chain Vest"])],
    secondary: [sampleItem("Sunfire Cape", ["Chain Vest", "Giant's Belt"])],
    special: [],
    avgPlace: 4.6,
    games: 2500,
    notes: null,
  },
  {
    apiName: "DA_18_Ahri",
    name: "Ahri",
    cost: 4,
    iconUrl: null,
    role: "AP Carry",
    primary: [sampleItem("Blue Buff", ["Tear of the Goddess", "Tear of the Goddess"]), sampleItem("Jeweled Gauntlet", ["Needlessly Large Rod", "Sparring Gloves"]), sampleItem("Nashor's Tooth", ["Recurve Bow", "Giant's Belt"])],
    secondary: [sampleItem("Rabadon's Deathcap")],
    special: [sampleItem("Manazane")],
    avgPlace: 4.25,
    games: 4000,
    notes: "Requires mana generation",
  },
];

describe("filterBisChampions", () => {
  it("returns all champions when no filter or query is set", () => {
    expect(filterBisChampions(sampleChampions, {})).toHaveLength(3);
  });

  it("filters by cost", () => {
    const result = filterBisChampions(sampleChampions, { costs: new Set([5]) });
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("Draven");
  });

  it("filters by role", () => {
    const result = filterBisChampions(sampleChampions, { roles: new Set(["Main Tank"]) });
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("Amumu");
  });

  it("searches by champion name (case-insensitive substring)", () => {
    const result = filterBisChampions(sampleChampions, { query: "ahr" });
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("Ahri");
  });

  it("searches by item name in primary, secondary, or special builds", () => {
    // Infinity Edge on Draven
    expect(filterBisChampions(sampleChampions, { query: "infinity edge" })).toHaveLength(1);
    // Sunfire Cape is in Amumu's secondary (flex)
    expect(filterBisChampions(sampleChampions, { query: "sunfire" })).toHaveLength(1);
    // Manazane is in Ahri's special (artifact)
    expect(filterBisChampions(sampleChampions, { query: "manazane" })).toHaveLength(1);
  });

  it("searches by item component name", () => {
    // "Tear of the Goddess" is in Ahri's Blue Buff
    const result = filterBisChampions(sampleChampions, { query: "Tear" });
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("Ahri");
  });

  it("searches by champion notes", () => {
    const result = filterBisChampions(sampleChampions, { query: "fast 9" });
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("Draven");
  });

  it("combines cost, role, and search query", () => {
    expect(
      filterBisChampions(sampleChampions, {
        costs: new Set([4]),
        roles: new Set(["AP Carry"]),
        query: "blue buff",
      }),
    ).toHaveLength(1);

    expect(
      filterBisChampions(sampleChampions, {
        costs: new Set([5]),
        roles: new Set(["AP Carry"]),
        query: "blue buff",
      }),
    ).toHaveLength(0);
  });
});
