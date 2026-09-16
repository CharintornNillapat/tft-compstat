import { describe, expect, it } from "vitest";
import type { Augment } from "./augment-tiers";
import { filterAugments } from "./augment-filter";

const sampleAugments: Augment[] = [
  {
    apiName: "TFT18_Augment_WiseSpending",
    name: "Wise Spending",
    rarity: "Prismatic",
    tier: "S",
    iconUrl: null,
    description: "Gain 2 XP whenever you refresh the shop.",
  },
  {
    apiName: "TFT18_Augment_RichGetRicher",
    name: "Rich Get Richer",
    rarity: "Gold",
    tier: "A",
    iconUrl: null,
    description: "Gain 10 gold. Maximum interest is increased to 7.",
  },
  {
    apiName: "TFT18_Augment_SilverSpoon",
    name: "Silver Spoon",
    rarity: "Silver",
    tier: "B",
    iconUrl: null,
    description: "Gain 10 XP immediately.",
  },
  {
    apiName: "TFT18_Augment_PrismaticTicket",
    name: "Prismatic Ticket",
    rarity: "Prismatic",
    tier: "S",
    iconUrl: null,
    description: "Each time you refresh, have a 50% chance to gain a free refresh.",
  },
];

describe("filterAugments", () => {
  it("returns all augments when no options are provided", () => {
    expect(filterAugments(sampleAugments, {})).toHaveLength(4);
  });

  it("filters by tier", () => {
    const result = filterAugments(sampleAugments, { tiers: new Set(["S"]) });
    expect(result).toHaveLength(2);
    expect(result.map((a) => a.name)).toEqual(["Wise Spending", "Prismatic Ticket"]);
  });

  it("filters by rarity", () => {
    const result = filterAugments(sampleAugments, { rarities: new Set(["Silver"]) });
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("Silver Spoon");
  });

  it("searches by augment name", () => {
    const result = filterAugments(sampleAugments, { query: "ticket" });
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("Prismatic Ticket");
  });

  it("searches by augment description effect", () => {
    // "interest" is in Rich Get Richer
    expect(filterAugments(sampleAugments, { query: "interest" })).toHaveLength(1);
    // "refresh" is in Wise Spending and Prismatic Ticket
    expect(filterAugments(sampleAugments, { query: "refresh" })).toHaveLength(2);
  });

  it("combines tier, rarity, and query", () => {
    const result = filterAugments(sampleAugments, {
      tiers: new Set(["S"]),
      rarities: new Set(["Prismatic"]),
      query: "XP",
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("Wise Spending");
  });

  it("returns empty when no match", () => {
    expect(filterAugments(sampleAugments, { query: "nonexistent augment" })).toHaveLength(0);
  });
});
