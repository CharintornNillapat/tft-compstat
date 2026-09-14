import { describe, expect, it } from "vitest";
import { textSourceLabel, toItemText } from "./tooltip-text";

describe("textSourceLabel", () => {
  it("names PBE data plainly and any other source as a patch", () => {
    expect(textSourceLabel("pbe")).toBe("Values from PBE data");
    expect(textSourceLabel("PBE")).toBe("Values from PBE data");
    expect(textSourceLabel("18.3")).toBe("Values from patch 18.3");
  });

  it("is null without a source", () => {
    expect(textSourceLabel(null)).toBeNull();
    expect(textSourceLabel("")).toBeNull();
  });
});

describe("toItemText", () => {
  it("keeps a row with a description or stats, and is null for a row with neither", () => {
    expect(toItemText({ description: "Gain 8% max Health.", stats: null, text_source: "pbe" })).toEqual({
      description: "Gain 8% max Health.",
      stats: null,
      source: "pbe",
    });
    expect(toItemText({ description: null, stats: null, text_source: null })).toBeNull();
  });
});
