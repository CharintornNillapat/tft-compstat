import { describe, expect, it } from "vitest";
import { ordinal, placementBand } from "./placement-styles";

describe("placementBand", () => {
  it("separates a win from the rest of the top four", () => {
    expect(placementBand(1)).toBe("win");
    expect([2, 3, 4].map(placementBand)).toEqual(["top4", "top4", "top4"]);
  });

  it("treats 5th through 8th as the bottom half", () => {
    expect([5, 6, 7, 8].map(placementBand)).toEqual(["bot4", "bot4", "bot4", "bot4"]);
  });
});

describe("ordinal", () => {
  it("uses the English ordinal suffixes", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"]);
  });

  it("handles the teens, where the suffix stops following the last digit", () => {
    expect([11, 12, 13, 21, 22, 23].map(ordinal)).toEqual(["11th", "12th", "13th", "21st", "22nd", "23rd"]);
  });
});
