import { describe, expect, it } from "vitest";
import { COMP_STYLES } from "@/lib/static/game";
import { CONTESTED_PICK_RATE, difficultyLevel, isContested, playstyleKind } from "./comp-badges";

describe("isContested", () => {
  it("starts at a 12% pick rate, inclusive", () => {
    expect(CONTESTED_PICK_RATE).toBe(0.12);
    // numeric(4,3) stores an authored 12.0 as exactly this fraction.
    expect(isContested(0.12)).toBe(true);
    expect(isContested(0.119)).toBe(false);
    expect(isContested(0.178)).toBe(true);
  });

  it("is never contested without a pick rate", () => {
    expect(isContested(null)).toBe(false);
    expect(isContested(0)).toBe(false);
  });
});

describe("difficultyLevel", () => {
  it("accepts 1-3 and nothing else", () => {
    expect([1, 2, 3].map(difficultyLevel)).toEqual([1, 2, 3]);
    expect([0, 4, 2.5, null].map(difficultyLevel)).toEqual([null, null, null, null]);
  });
});

describe("playstyleKind", () => {
  it("covers every comp style", () => {
    expect(Object.fromEntries(COMP_STYLES.map((style) => [style, playstyleKind(style)]))).toEqual({
      fast8: "fast",
      fast9: "fast",
      reroll_1: "reroll",
      reroll_2: "reroll",
      reroll_3: "reroll",
      flex: "flex",
    });
  });
});
