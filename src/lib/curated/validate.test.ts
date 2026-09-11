import { describe, expect, it } from "vitest";
import {
  checkTierListSet,
  formatIssue,
  formatPath,
  suggestApiNames,
  validateTierList,
  type ReferenceIndex,
  type SeedTierList,
} from "./validate";

const index: ReferenceIndex = {
  champions: new Map([
    ["DA_18_Ashe", { name: "Ashe", setId: 18 }],
    ["DA_18_Sivir", { name: "Sivir", setId: 18 }],
    ["DA_18_KhaZix", { name: "Kha'Zix", setId: 18 }],
    ["DA_Lux18_Base", { name: "Lux", setId: 18 }],
    ["TFT17_Jinx", { name: "Jinx", setId: 17 }],
  ]),
  items: new Map([
    ["DA_InfinityEdge", { name: "Infinity Edge" }],
    ["TFT_Item_InfinityEdge", { name: "Infinity Edge" }],
    ["DA_18_EmblemHunter", { name: "Hunter Emblem" }],
  ]),
};

const FILE = "data/curated/18/champion-tiers.yaml";

const championYaml = `
slug: champions-18.1
kind: champion
patch: "18.1"
current: true
summary: Sample ratings.
tiers:
  S: [DA_18_Ashe, DA_18_Sivir]
  A:
    - DA_18_KhaZix
  C: [DA_Lux18_Base]
notes:
  DA_18_Ashe: Best 5-cost carry.
`;

const validate = (text: string, overrides: Partial<Parameters<typeof validateTierList>[0]> = {}) =>
  validateTierList({ file: FILE, text, setId: 18, kind: "champion", index, ...overrides });

/** Replaces the first occurrence of `from` in the sample file. */
const variant = (from: string, to: string) => {
  if (!championYaml.includes(from)) throw new Error(`fixture has no "${from}"`);
  return championYaml.replace(from, to);
};

describe("validateTierList: valid files", () => {
  it("turns a valid file into ordered, DB-ready entries", () => {
    const { list, issues } = validate(championYaml);
    expect(issues).toEqual([]);
    expect(list).toEqual({
      file: FILE,
      slug: "champions-18.1",
      kind: "champion",
      setId: 18,
      patch: "18.1",
      title: "Champion tier list",
      summary: "Sample ratings.",
      isCurrent: true,
      entries: [
        { tier: "S", position: 0, apiName: "DA_18_Ashe", note: "Best 5-cost carry." },
        { tier: "S", position: 1, apiName: "DA_18_Sivir", note: null },
        { tier: "A", position: 0, apiName: "DA_18_KhaZix", note: null },
        { tier: "C", position: 0, apiName: "DA_Lux18_Base", note: null },
      ],
    });
  });

  it("validates item lists against every known item", () => {
    const text = `slug: items-18.1\nkind: item\npatch: "18.1"\ntiers:\n  S: [DA_InfinityEdge, DA_18_EmblemHunter]\n`;
    const { list, issues } = validate(text, { file: "data/curated/18/item-tiers.yaml", kind: "item" });
    expect(issues).toEqual([]);
    expect(list?.title).toBe("Item tier list");
    expect(list?.isCurrent).toBe(false);
  });
});

describe("validateTierList: bad references", () => {
  it("rejects a typo'd api_name with the file, line and path", () => {
    const { list, issues } = validate(variant("DA_18_Sivir", "DA_18_Sivri"));
    expect(list).toBeUndefined();
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ file: FILE, path: "tiers.S[1]", line: 8, col: 19 });
    expect(formatIssue(issues[0]!)).toBe(
      `${FILE}:8:19  tiers.S[1]: unknown set 18 champion "DA_18_Sivri". Did you mean DA_18_Sivir?`,
    );
  });

  it("suggests the api name when a display name is used", () => {
    const { issues } = validate(variant("- DA_18_KhaZix", "- KhaZix"));
    expect(issues[0]).toMatchObject({ path: "tiers.A[0]", line: 10 });
    expect(issues[0]?.message).toMatch(/Did you mean DA_18_KhaZix\?/);
  });

  it("rejects a champion from another set", () => {
    const { issues } = validate(variant("DA_Lux18_Base", "TFT17_Jinx"));
    expect(issues[0]?.message).toBe("TFT17_Jinx is a set 17 champion, but this file is in the set 18 folder");
  });

  it("offers every item sharing the name", () => {
    const text = `slug: items-18.1\nkind: item\npatch: "18.1"\ntiers:\n  S: [InfinityEdge]\n`;
    const { issues } = validate(text, { kind: "item" });
    expect(issues[0]?.message).toBe(
      'unknown item "InfinityEdge". Did you mean DA_InfinityEdge or TFT_Item_InfinityEdge?',
    );
  });

  it("reports every bad reference in one run", () => {
    const text = variant("[DA_18_Ashe, DA_18_Sivir]", "[DA_18_Ashe, DA_18_Sivri, Nobody]");
    expect(validate(text).issues.map((i) => i.path)).toEqual(["tiers.S[1]", "tiers.S[2]"]);
  });
});

describe("validateTierList: schema and consistency", () => {
  it("explains an unquoted patch number", () => {
    const { issues } = validate(variant('patch: "18.1"', "patch: 18.10"));
    expect(issues[0]).toMatchObject({ path: "patch", line: 4 });
    expect(issues[0]?.message).toMatch(/quoted string like "18.1"/);
  });

  it("rejects unknown tiers and unknown keys", () => {
    expect(validate(variant("  C: [", "  D: [")).issues[0]).toMatchObject({
      path: "tiers",
      message: 'unknown tier "D"; use S, A, B or C',
    });
    expect(validate(variant("current: true", "curent: true")).issues[0]?.message).toMatch(/curent/);
  });

  it("points missing required keys at the document", () => {
    const { issues } = validate(variant("slug: champions-18.1\n", ""));
    expect(issues[0]).toMatchObject({ path: "slug", line: 2 });
  });

  it("rejects duplicates, orphan notes, empty lists and a kind that doesn't match the file", () => {
    expect(validate(variant("- DA_18_KhaZix", "- DA_18_Ashe")).issues[0]).toMatchObject({
      path: "tiers.A[0]",
      message: "DA_18_Ashe is already listed at tiers.S[0]",
    });
    expect(validate(variant("DA_18_Ashe: Best", "DA_18_Seraphine: Best")).issues[0]).toMatchObject({
      path: "notes.DA_18_Seraphine",
      line: 13,
    });
    expect(validate(`slug: x\nkind: champion\npatch: "18.1"\ntiers: {}\n`).issues[0]?.message).toBe(
      "lists no entries",
    );
    expect(validate(championYaml, { kind: "item" }).issues[0]).toMatchObject({ path: "kind" });
  });

  it("reports YAML syntax errors with their position", () => {
    const { issues } = validate("slug: x\ntiers:\n  S: [DA_18_Ashe\n");
    expect(issues[0]?.message).toMatch(/^invalid YAML/);
    expect(issues[0]?.line).toBeGreaterThan(0);
  });
});

describe("checkTierListSet", () => {
  const list = (file: string, slug: string, isCurrent: boolean): SeedTierList => ({
    file,
    slug,
    kind: "champion",
    setId: 18,
    patch: "18.1",
    title: "t",
    summary: null,
    isCurrent,
    entries: [],
  });

  it("allows one current list per kind and unique slugs", () => {
    expect(checkTierListSet([list("a.yaml", "a", true), list("b.yaml", "b", false)])).toEqual([]);
  });

  it("rejects a second current list and a reused slug", () => {
    expect(checkTierListSet([list("a.yaml", "a", true), list("b.yaml", "a", true)])).toEqual([
      { file: "b.yaml", path: "slug", message: '"a" is also used by a.yaml' },
      { file: "b.yaml", path: "current", message: "a.yaml is also the current champion list; only one can be current" },
    ]);
  });
});

describe("helpers", () => {
  it("formats YAML paths", () => {
    expect(formatPath(["tiers", "S", 3])).toBe("tiers.S[3]");
    expect(formatPath(["notes", "DA_18_Ashe"])).toBe("notes.DA_18_Ashe");
  });

  it("suggests nothing for unrelated input", () => {
    expect(suggestApiNames("Zzzzzzzz", index.champions)).toEqual([]);
  });
});
