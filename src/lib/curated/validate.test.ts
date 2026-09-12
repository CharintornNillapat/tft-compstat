import { describe, expect, it } from "vitest";
import {
  checkCompSet,
  checkTierListSet,
  formatIssue,
  formatPath,
  suggestApiNames,
  validateComp,
  validateTierList,
  type ReferenceIndex,
  type SeedComp,
  type SeedTierList,
} from "./validate";

const index: ReferenceIndex = {
  champions: new Map([
    ["DA_18_Ashe", { name: "Ashe", setId: 18, traits: ["DA_18_Blossom", "DA_18_Hunter"] }],
    ["DA_18_Sivir", { name: "Sivir", setId: 18, traits: ["DA_Primal18", "DA_18_Hunter"] }],
    ["DA_18_KhaZix", { name: "Kha'Zix", setId: 18, traits: ["DA_18_Rival"] }],
    ["DA_Lux18_Base", { name: "Lux", setId: 18, traits: ["DA_18_LuxUniqueTrait"] }],
    ["DA_18_Sett", { name: "Sett", setId: 18, traits: ["DA_18_Blossom", "DA_18_Brawler"] }],
    ["TFT17_Jinx", { name: "Jinx", setId: 17, traits: [] }],
  ]),
  items: new Map([
    ["DA_InfinityEdge", { name: "Infinity Edge", grantsTrait: null }],
    ["TFT_Item_InfinityEdge", { name: "Infinity Edge", grantsTrait: null }],
    ["DA_LastWhisper", { name: "Last Whisper", grantsTrait: null }],
    ["DA_WarmogsArmor", { name: "Warmogs Armor", grantsTrait: null }],
    ["DA_18_EmblemHunter", { name: "Hunter Emblem", grantsTrait: "DA_18_Hunter" }],
    ["DA_18_EmblemBrawler", { name: "Brawler Emblem", grantsTrait: "DA_18_Brawler" }],
  ]),
  traits: new Map([
    ["DA_18_Hunter", { name: "Hunter" }],
    ["DA_18_Brawler", { name: "Brawler" }],
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

const COMP_FILE = "data/curated/18/comps/ashe-hunters.yaml";

const compYaml = `
slug: ashe-hunters
name: Ashe Hunters
tier: A
style: fast8
difficulty: 2
patch: "18.2"
summary: Sample comp.
early_units: [DA_18_Sett, DA_18_Sivir]
flex_units: [DA_18_KhaZix]
board:
  - { unit: DA_18_Ashe, row: 3, col: 0, star: 2, carry: true, items: [DA_InfinityEdge, DA_LastWhisper, DA_18_EmblemBrawler] }
  - { unit: DA_18_Sett, row: 0, col: 3, items: [DA_WarmogsArmor] }
  - { unit: DA_18_Sivir, row: 3, col: 1, star: 1 }
guide: |
  **Early:** play Sett.
`;

const validateCompText = (text: string, file = COMP_FILE) => validateComp({ file, text, setId: 18, index });

/** Replaces the first occurrence of `from` in the sample comp. */
const compVariant = (from: string, to: string) => {
  if (!compYaml.includes(from)) throw new Error(`fixture has no "${from}"`);
  return compYaml.replace(from, to);
};

describe("validateComp: valid files", () => {
  it("turns a valid file into a DB-ready comp with defaults filled in", () => {
    const { comp, issues } = validateCompText(compYaml);
    expect(issues).toEqual([]);
    expect(comp).toEqual({
      file: COMP_FILE,
      slug: "ashe-hunters",
      setId: 18,
      patch: "18.2",
      name: "Ashe Hunters",
      tier: "A",
      style: "fast8",
      difficulty: 2,
      summary: "Sample comp.",
      guide: "**Early:** play Sett.",
      sortOrder: 0,
      isPublished: true,
      isGem: false,
      avgPlace: null,
      top4Rate: null,
      pickRate: null,
      levelRecommended: null,
      earlyUnits: ["DA_18_Sett", "DA_18_Sivir"],
      flexUnits: ["DA_18_KhaZix"],
      units: [
        {
          apiName: "DA_18_Ashe",
          row: 3,
          col: 0,
          star: 2,
          isCarry: true,
          carryPriority: null,
          items: ["DA_InfinityEdge", "DA_LastWhisper", "DA_18_EmblemBrawler"],
        },
        {
          apiName: "DA_18_Sett",
          row: 0,
          col: 3,
          star: 2,
          isCarry: false,
          carryPriority: null,
          items: ["DA_WarmogsArmor"],
        },
        { apiName: "DA_18_Sivir", row: 3, col: 1, star: 1, isCarry: false, carryPriority: null, items: [] },
      ],
    });
  });
});

describe("validateComp: board rules", () => {
  it("rejects a typo'd unit or item with the file, line and path", () => {
    const { comp, issues } = validateCompText(compVariant("unit: DA_18_Sett,", "unit: DA_18_Set,"));
    expect(comp).toBeUndefined();
    expect(issues).toHaveLength(1);
    expect(formatIssue(issues[0]!)).toBe(
      `${COMP_FILE}:13:13  board[1].unit: unknown set 18 champion "DA_18_Set". Did you mean DA_18_Sett?`,
    );
    expect(validateCompText(compVariant("DA_LastWhisper", "DA_LastWisper")).issues[0]).toMatchObject({
      path: "board[0].items[1]",
      line: 12,
      message: 'unknown item "DA_LastWisper". Did you mean DA_LastWhisper?',
    });
  });

  it("rejects a unit placed twice and two units on one hex", () => {
    expect(validateCompText(compVariant("unit: DA_18_Sivir", "unit: DA_18_Ashe")).issues[0]).toMatchObject({
      path: "board[2].unit",
      message: "DA_18_Ashe is already on the board at board[0]",
    });
    expect(validateCompText(compVariant("row: 3, col: 1", "row: 3, col: 0")).issues[0]).toMatchObject({
      path: "board[2].col",
      message: "row 3, col 0 is already taken by DA_18_Ashe at board[0]",
    });
  });

  it("enforces the board's shape, 3 items per unit and at least one carry", () => {
    expect(validateCompText(compVariant("row: 0, col: 3", "row: 4, col: 3")).issues[0]).toMatchObject({
      path: "board[1].row",
      message: "must be a row from 0 (front) to 3 (back)",
    });
    expect(validateCompText(compVariant("col: 3", "col: 7")).issues[0]?.message).toBe("must be a column from 0 to 6");
    expect(
      validateCompText(compVariant("DA_18_EmblemBrawler]", "DA_18_EmblemBrawler, DA_WarmogsArmor]")).issues[0],
    ).toMatchObject({ path: "board[0].items", message: "a unit holds at most 3 items" });
    expect(validateCompText(compVariant("carry: true", "carry: false")).issues[0]).toMatchObject({
      path: "board",
      message: expect.stringMatching(/^needs at least one carry/),
    });
  });

  it("rejects an emblem for a trait the unit already has", () => {
    const { issues } = validateCompText(compVariant("DA_18_EmblemBrawler]", "DA_18_EmblemHunter]"));
    expect(issues[0]).toMatchObject({
      path: "board[0].items[2]",
      message: "Ashe is already Hunter, so Hunter Emblem adds nothing",
    });
  });

  it("checks early and flex units", () => {
    expect(validateCompText(compVariant("flex_units: [DA_18_KhaZix]", "flex_units: [DA_18_Sivir]")).issues[0]).toMatchObject({
      path: "flex_units[0]",
      message: "DA_18_Sivir is already on the board at board[2]; flex units are swaps",
    });
    expect(validateCompText(compVariant("[DA_18_Sett, DA_18_Sivir]", "[DA_18_Sett, DA_18_Sett]")).issues[0]).toMatchObject({
      path: "early_units[1]",
      message: "DA_18_Sett is already listed at early_units[0]",
    });
    expect(validateCompText(compVariant("[DA_18_KhaZix]", "[TFT17_Jinx]")).issues[0]?.message).toBe(
      "TFT17_Jinx is a set 17 champion, but this file is in the set 18 folder",
    );
  });

  it("requires the slug to match the file name", () => {
    const { issues } = validateCompText(compYaml, "data/curated/18/comps/ashe.yaml");
    expect(issues[0]).toMatchObject({ path: "slug", message: 'is "ashe-hunters", but the file is named ashe; they must match' });
  });

  it("rejects unknown styles and keys", () => {
    expect(validateCompText(compVariant("style: fast8", "style: fast7")).issues[0]?.path).toBe("style");
    expect(validateCompText(compVariant("tier: A", "tier: A\nteir: S")).issues[0]?.message).toMatch(/teir/);
  });
});

describe("checkCompSet", () => {
  const comp = (file: string, slug: string) => ({ file, slug }) as SeedComp;

  it("rejects a slug used in two set folders", () => {
    expect(checkCompSet([comp("data/curated/17/comps/a.yaml", "a"), comp("data/curated/18/comps/b.yaml", "b")])).toEqual([]);
    expect(checkCompSet([comp("data/curated/17/comps/a.yaml", "a"), comp("data/curated/18/comps/a.yaml", "a")])).toEqual([
      { file: "data/curated/18/comps/a.yaml", path: "slug", message: '"a" is also used by data/curated/17/comps/a.yaml' },
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

describe("validateComp: gem flag, curated stats and item priority", () => {
  /** The sample comp plus extra top-level keys, one per argument. */
  const withStats = (...lines: string[]) =>
    compVariant("summary: Sample comp.", ["summary: Sample comp.", ...lines].join("\n"));

  it("reads the gem flag, the level and the stats, converting percent to a fraction", () => {
    const { comp, issues } = validateCompText(
      withStats("gem: true", "avg_place: 4.32", "top4_rate: 56.4", "pick_rate: 2.1", "level_recommended: 8"),
    );
    expect(issues).toEqual([]);
    expect(comp).toMatchObject({
      isGem: true,
      avgPlace: 4.32,
      top4Rate: 0.564,
      pickRate: 0.021,
      levelRecommended: 8,
    });
  });

  it("defaults to no gem and no stats", () => {
    expect(validateCompText(compYaml).comp).toMatchObject({
      isGem: false,
      avgPlace: null,
      top4Rate: null,
      pickRate: null,
      levelRecommended: null,
    });
  });

  it("rounds to what the numeric columns can actually store", () => {
    // numeric(3,2) and numeric(4,3): rounding here keeps the seed summary honest.
    const { comp } = validateCompText(withStats("avg_place: 4.327", "top4_rate: 56.47"));
    expect(comp).toMatchObject({ avgPlace: 4.33, top4Rate: 0.565 });
  });

  it("rejects an out-of-range rate or placement, naming the unit", () => {
    expect(validateCompText(withStats("top4_rate: 156")).issues[0]?.message).toMatch(/percentage/);
    expect(validateCompText(withStats("avg_place: 9")).issues[0]?.message).toBe("must be at most 8");
  });

  it("reads item priority and orders the units by it", () => {
    const { comp, issues } = validateCompText(
      withStats().replace("carry: true,", "carry: true, priority: 1,").replace(
        "unit: DA_18_Sett, row: 0, col: 3,",
        "unit: DA_18_Sett, row: 0, col: 3, priority: 2,",
      ),
    );
    expect(issues).toEqual([]);
    expect(comp?.units.map((unit) => [unit.apiName, unit.carryPriority])).toEqual([
      ["DA_18_Ashe", 1],
      ["DA_18_Sett", 2],
      ["DA_18_Sivir", null],
    ]);
  });

  it("rejects a priority on a unit that holds no items", () => {
    const { comp, issues } = validateCompText(
      compVariant("unit: DA_18_Sivir, row: 3, col: 1, star: 1", "unit: DA_18_Sivir, row: 3, col: 1, star: 1, priority: 1"),
    );
    expect(comp).toBeUndefined();
    expect(issues[0]).toMatchObject({
      path: "board[2].priority",
      message: "DA_18_Sivir holds no items, so it has no item priority",
    });
  });

  it("rejects two units claiming the same priority", () => {
    const { issues } = validateCompText(
      compVariant("carry: true,", "carry: true, priority: 1,").replace(
        "unit: DA_18_Sett, row: 0, col: 3,",
        "unit: DA_18_Sett, row: 0, col: 3, priority: 1,",
      ),
    );
    expect(issues[0]).toMatchObject({ path: "board[1].priority", message: "priority 1 is already DA_18_Ashe" });
  });

  it("rejects a gap in the priorities, which is nearly always a typo for the one below", () => {
    const { issues } = validateCompText(compVariant("carry: true,", "carry: true, priority: 2,"));
    expect(issues[0]).toMatchObject({
      path: "board",
      message: "priority 2 is used but 1 is not; priorities run 1, 2, 3 in order",
    });
  });
});
