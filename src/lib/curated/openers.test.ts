import { describe, expect, it } from "vitest";
import type { NameBook } from "@/lib/static/names";
import { validateOpeners, type OpenerReferences } from "./openers";
import { formatIssue } from "./validate";

const FILE = "data/curated/18/openers.yaml";

const names: NameBook = {
  champions: {
    DA_18_Ornn: { name: "Ornn", cost: 1, iconUrl: "ornn.png" },
    DA_18_Xayah: { name: "Xayah", cost: 1, iconUrl: null },
    DA_18_Alistar: { name: "Alistar", cost: 2, iconUrl: null },
    DA_18_Draven: { name: "Draven", cost: 5, iconUrl: null },
  },
  traits: {},
  items: {
    DA_SunfireCape: { name: "Sunfire Cape", iconUrl: "sunfire.png" },
    DA_GuinsoosRageblade: { name: "Guinsoo's Rageblade", iconUrl: null },
  },
};

const refs: OpenerReferences = {
  names,
  comps: new Map([
    ["ashe-fast-9", { name: "Ashe Fast 9", tier: "S" as const }],
    ["elderwood-kayle", { name: "Elderwood Kayle", tier: "C" as const }],
  ]),
};

const parse = (yaml: string, override: Partial<OpenerReferences> = {}) =>
  validateOpeners({ file: FILE, text: yaml, refs: { ...refs, ...override } });
const messages = (yaml: string, override?: Partial<OpenerReferences>) =>
  parse(yaml, override).issues.map((issue) => issue.message);

/** A file with one opener, so each test can vary a single field. */
const file = (body: string) => `patch: "18.2"\nopeners:\n  - ${body.trim().replace(/\n/g, "\n    ")}\n`;

const VALID = file(`
name: Elderwood Brawlers
tier: S
core_units: [DA_18_Ornn, DA_18_Xayah, DA_18_Alistar]
slammable_items: [DA_SunfireCape, DA_GuinsoosRageblade]
transition_to: [ashe-fast-9, elderwood-kayle]
notes: Slam on Xayah and streak.
`);

describe("validateOpeners", () => {
  it("resolves units, items and pivots to what the card renders", () => {
    expect(parse(VALID).openers).toEqual({
      patch: "18.2",
      title: "Early openers & item slams",
      openers: [
        {
          name: "Elderwood Brawlers",
          tier: "S",
          units: [
            { apiName: "DA_18_Ornn", name: "Ornn", cost: 1, iconUrl: "ornn.png" },
            { apiName: "DA_18_Xayah", name: "Xayah", cost: 1, iconUrl: null },
            { apiName: "DA_18_Alistar", name: "Alistar", cost: 2, iconUrl: null },
          ],
          items: [
            { apiName: "DA_SunfireCape", name: "Sunfire Cape", iconUrl: "sunfire.png" },
            { apiName: "DA_GuinsoosRageblade", name: "Guinsoo's Rageblade", iconUrl: null },
          ],
          pivots: [
            { slug: "ashe-fast-9", name: "Ashe Fast 9", tier: "S" },
            { slug: "elderwood-kayle", name: "Elderwood Kayle", tier: "C" },
          ],
          notes: "Slam on Xayah and streak.",
        },
      ],
    });
  });

  it("points a typo'd unit at the right champion, with file:line:col", () => {
    const [issue] = parse(VALID.replace("DA_18_Xayah", "DA_18_Xaya")).issues;
    expect(formatIssue(issue!)).toBe(
      `${FILE}:5:30  openers[0].core_units[1]: unknown champion "DA_18_Xaya". Did you mean DA_18_Xayah?`,
    );
  });

  it("rejects a unit too expensive to open on", () => {
    expect(messages(VALID.replace("DA_18_Alistar", "DA_18_Draven"))).toEqual([
      "Draven is a 5-cost; an opener fields 1-cost and 2-cost units",
    ]);
  });

  it("rejects an unknown item", () => {
    expect(messages(VALID.replace("DA_GuinsoosRageblade", "DA_StatikkShiv"))).toEqual([
      'unknown item "DA_StatikkShiv"',
    ]);
  });

  it("hides a pivot with no published comp behind it, and warns instead of failing the build", () => {
    const result = parse(VALID.replace("elderwood-kayle", "elderwood-kale"));
    expect(result.issues).toEqual([]);
    expect(result.openers?.openers[0]?.pivots).toEqual([{ slug: "ashe-fast-9", name: "Ashe Fast 9", tier: "S" }]);
    expect(result.warnings.map((warning) => warning.message)).toEqual([
      'no published comp has the slug "elderwood-kale"; hiding that pivot',
    ]);
  });

  it("rejects the same unit, slam or pivot listed twice", () => {
    expect(messages(VALID.replace("DA_18_Xayah,", "DA_18_Ornn,"))).toEqual([
      "DA_18_Ornn is already listed as a core unit",
    ]);
    expect(messages(VALID.replace("DA_GuinsoosRageblade", "DA_SunfireCape"))).toEqual([
      "DA_SunfireCape is already listed as a slam",
    ]);
    expect(messages(VALID.replace("elderwood-kayle", "ashe-fast-9"))).toEqual([
      "ashe-fast-9 is already listed as a pivot",
    ]);
  });

  it("reports a duplicated unit once, not twice", () => {
    // The cost check is skipped for a repeat: the first mention already covers it.
    expect(messages(VALID.replace("DA_18_Xayah, DA_18_Alistar", "DA_18_Draven, DA_18_Draven"))).toEqual([
      "DA_18_Draven is already listed as a core unit",
      "Draven is a 5-cost; an opener fields 1-cost and 2-cost units",
    ]);
  });

  it("rejects two openers with the same name, which would collide as React keys", () => {
    expect(messages(VALID + VALID.split("openers:\n")[1]!)).toEqual([
      '"Elderwood Brawlers" is already the name of openers[0]',
    ]);
  });

  it("holds the card to a glance: 3-4 units, 2-3 slams, 2-3 pivots, a short note", () => {
    expect(messages(VALID.replace("[DA_18_Ornn, DA_18_Xayah, DA_18_Alistar]", "[DA_18_Ornn, DA_18_Xayah]"))).toEqual([
      "needs at least 3 champion api_names",
    ]);
    expect(messages(VALID.replace("[DA_SunfireCape, DA_GuinsoosRageblade]", "[DA_SunfireCape]"))).toEqual([
      "needs at least 2 item api_names",
    ]);
    expect(messages(VALID.replace("Slam on Xayah and streak.", "x".repeat(97)))).toEqual([
      "must be at most 96 characters, so the card stays short",
    ]);
  });

  it("rejects an unknown tier band; openers are not rated below B", () => {
    expect(messages(VALID.replace("tier: S", "tier: C"))).toEqual([
      'Invalid option: expected one of "S"|"A"|"B"',
    ]);
  });

  it("rejects an unquoted patch, which YAML would read as a number", () => {
    expect(messages(VALID.replace('patch: "18.2"', "patch: 18.10"))).toEqual([
      'must be a quoted string like "18.1" (unquoted, 18.10 would read as the number 18.1)',
    ]);
  });

  it("rejects a file with no openers in it", () => {
    expect(messages('patch: "18.2"\nopeners: []\n')).toEqual([
      "needs at least one opener; an empty file would render an empty section",
    ]);
  });

  it("attaches carry to a pivot when the comp reference supplies one", () => {
    const customRefs: OpenerReferences = {
      names,
      comps: new Map([
        ["ashe-fast-9", { name: "Ashe Fast 9", tier: "S" as const, carry: { name: "Ashe", cost: 5, iconUrl: "ashe.png" } }],
        ["elderwood-kayle", { name: "Elderwood Kayle", tier: "C" as const }],
      ]),
    };
    const result = validateOpeners({ file: FILE, text: VALID, refs: customRefs });
    expect(result.openers?.openers[0]?.pivots).toEqual([
      { slug: "ashe-fast-9", name: "Ashe Fast 9", tier: "S", carry: { name: "Ashe", cost: 5, iconUrl: "ashe.png" } },
      { slug: "elderwood-kayle", name: "Elderwood Kayle", tier: "C" },
    ]);
  });
});
