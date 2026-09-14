import { describe, expect, it } from "vitest";
import { extractOpenerPivotSlugs } from "./opener-pivots";

const FILE = "data/curated/18/openers.yaml";

const opener = (name: string, transitionTo: string) =>
  `  - name: ${name}\n    tier: S\n    core_units: [DA_18_Ornn, DA_18_Xayah, DA_18_Alistar]\n` +
  `    slammable_items: [DA_SunfireCape, DA_GuinsoosRageblade]\n    transition_to: [${transitionTo}]\n` +
  `    notes: Slam and streak.\n`;

const file = (openers: string) => `patch: "18.2"\nopeners:\n${openers}`;

describe("extractOpenerPivotSlugs", () => {
  it("lists every transition_to slug across every opener, deduplicated", () => {
    const text = file(
      opener("Elderwood Brawlers", "ashe-fast-9, elderwood-kayle") + opener("Second Opener", "ashe-fast-9"),
    );
    expect(extractOpenerPivotSlugs(FILE, text)).toEqual(["ashe-fast-9", "elderwood-kayle"]);
  });

  it("returns an empty list rather than throwing on a file too broken to parse", () => {
    expect(extractOpenerPivotSlugs(FILE, "not: [valid")).toEqual([]);
    expect(extractOpenerPivotSlugs(FILE, "")).toEqual([]);
  });

  it("returns an empty list for a well-formed file naming no openers", () => {
    expect(extractOpenerPivotSlugs(FILE, 'patch: "18.2"\nopeners: []\n')).toEqual([]);
  });

  it("still finds slugs in a file that fails schema validation elsewhere", () => {
    // An unquoted patch fails the schema (it parses as the number 18.1), but
    // transition_to is still readable off the raw YAML.
    const text = file(opener("Elderwood Brawlers", "ashe-fast-9, elderwood-kayle")).replace(
      'patch: "18.2"',
      "patch: 18.10",
    );
    expect(extractOpenerPivotSlugs(FILE, text)).toEqual(["ashe-fast-9", "elderwood-kayle"]);
  });

  it("ignores a non-string entry rather than throwing", () => {
    const text = file(opener("Elderwood Brawlers", "ashe-fast-9, 42"));
    expect(extractOpenerPivotSlugs(FILE, text)).toEqual(["ashe-fast-9"]);
  });
});
