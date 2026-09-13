import { describe, expect, it } from "vitest";
import type { NameBook } from "@/lib/static/names";
import { validateChampionBis, type BisReferences } from "./bis";
import { formatIssue } from "./validate";

const FILE = "data/curated/18/champion-bis.yaml";

const names: NameBook = {
  champions: {
    DA_18_Ashe: { name: "Ashe", cost: 5, iconUrl: "ashe.png" },
    DA_18_Ornn: { name: "Ornn", cost: 1, iconUrl: null },
  },
  traits: { DA_18_Inferno: { name: "Inferno", iconUrl: null } },
  items: {
    DA_GiantSlayer: { name: "Giant Slayer", iconUrl: "gs.png" },
    DA_InfinityEdge: { name: "Infinity Edge", iconUrl: null },
    DA_RedBuff: { name: "Red Buff", iconUrl: null },
    DA_Quicksilver: { name: "Quicksilver", iconUrl: null },
    DA_Deathblade: { name: "Deathblade", iconUrl: null },
    DA_Component_BFSword: { name: "B.F. Sword", iconUrl: "bf.png" },
    DA_Component_RecurveBow: { name: "Recurve Bow", iconUrl: null },
    DA_18_EmblemInferno: { name: "Inferno Emblem", iconUrl: null },
    DA_Artifact_LichBane: { name: "Lich Bane", iconUrl: null },
    DA_InfinityEdgeRadiant: { name: "Radiant Infinity Edge", iconUrl: null },
  },
};

const refs: BisReferences = {
  names,
  itemDetails: new Map([
    ["DA_GiantSlayer", { components: ["DA_Component_BFSword", "DA_Component_RecurveBow"], grantsTrait: null }],
    ["DA_18_EmblemInferno", { components: [], grantsTrait: "DA_18_Inferno" }],
    ["DA_Artifact_LichBane", { components: [], grantsTrait: null, kind: "artifact" }],
    ["DA_InfinityEdgeRadiant", { components: [], grantsTrait: null, kind: "radiant" }],
  ]),
};

const parse = (yaml: string) => validateChampionBis({ file: FILE, text: yaml, refs });
const messages = (yaml: string) => parse(yaml).issues.map((issue) => issue.message);

const VALID = `patch: "18.2"
champions:
  - api_name: DA_18_Ashe
    role: AD Carry
    primary_bis: [DA_GiantSlayer, DA_InfinityEdge, DA_RedBuff]
    secondary_bis: [DA_Quicksilver, DA_Deathblade]
    avg_place: 3.1
    games: 800
`;

describe("validateChampionBis", () => {
  it("resolves a row to what the page renders, recipe included", () => {
    const bis = parse(VALID).bis;
    expect(bis?.patch).toBe("18.2");
    expect(bis?.title).toBe("Best in slot");
    const [champion] = bis!.champions;
    expect(champion).toMatchObject({
      apiName: "DA_18_Ashe",
      name: "Ashe",
      cost: 5,
      role: "AD Carry",
      avgPlace: 3.1,
      games: 800,
      notes: null,
    });
    expect(champion!.primary.map((item) => item.name)).toEqual(["Giant Slayer", "Infinity Edge", "Red Buff"]);
    expect(champion!.primary[0]!.components.map((c) => c.name)).toEqual(["B.F. Sword", "Recurve Bow"]);
    expect(champion!.secondary.map((item) => item.name)).toEqual(["Quicksilver", "Deathblade"]);
  });

  it("treats special_bis as optional", () => {
    expect(parse(VALID).bis?.champions[0]?.special).toEqual([]);
  });

  it("resolves artifacts and radiants with their kind", () => {
    const yaml = VALID.replace("    avg_place:", "    special_bis: [DA_InfinityEdgeRadiant, DA_Artifact_LichBane]\n    avg_place:");
    const special = parse(yaml).bis?.champions[0]?.special;
    expect(special?.map((item) => [item.name, item.kind])).toEqual([
      ["Radiant Infinity Edge", "radiant"],
      ["Lich Bane", "artifact"],
    ]);
  });

  it("rejects an artifact listed twice, and more than three", () => {
    const twice = VALID.replace("    avg_place:", "    special_bis: [DA_Artifact_LichBane, DA_Artifact_LichBane]\n    avg_place:");
    expect(messages(twice)).toEqual(["DA_Artifact_LichBane is listed twice in special_bis"]);
    const four = VALID.replace("    avg_place:", `    special_bis: [${Array(4).fill("DA_Artifact_LichBane").join(", ")}]\n    avg_place:`);
    expect(messages(four)).toEqual(["holds at most 3 artifacts or radiants"]);
  });

  it("resolves an emblem's trait for the tooltip", () => {
    const yaml = VALID.replace("DA_RedBuff]", "DA_18_EmblemInferno]");
    expect(parse(yaml).bis?.champions[0]?.primary[2]?.grantsTrait).toBe("Inferno");
  });

  it("points a typo'd champion at the right one, with file:line:col", () => {
    const [issue] = parse(VALID.replace("DA_18_Ashe", "DA_18_Ashee")).issues;
    expect(formatIssue(issue!)).toBe(
      `${FILE}:3:15  champions[0].api_name: unknown champion "DA_18_Ashee". Did you mean DA_18_Ashe?`,
    );
  });

  it("rejects an unknown item", () => {
    expect(messages(VALID.replace("DA_RedBuff]", "DA_NotAnItem]"))).toEqual(['unknown item "DA_NotAnItem"']);
  });

  it("allows the same item twice in one build — two of an item is a legal board", () => {
    const yaml = VALID.replace("[DA_GiantSlayer, DA_InfinityEdge, DA_RedBuff]", "[DA_RedBuff, DA_RedBuff, DA_InfinityEdge]");
    expect(messages(yaml)).toEqual([]);
    expect(parse(yaml).bis?.champions[0]?.primary).toHaveLength(3);
  });

  it("rejects an alternative that is already in the build, which offers no alternative", () => {
    expect(messages(VALID.replace("[DA_Quicksilver, DA_Deathblade]", "[DA_RedBuff, DA_Deathblade]"))).toEqual([
      "DA_RedBuff is already in primary_bis, so it is not an alternative",
    ]);
  });

  it("rejects two rows for one champion, which would collide as React keys", () => {
    expect(messages(VALID + VALID.split("champions:\n")[1]!)).toEqual([
      "DA_18_Ashe already has a build at champions[0]",
    ]);
  });

  it("holds a build to three items and 2-3 alternatives", () => {
    expect(messages(VALID.replace(", DA_RedBuff]", "]"))).toEqual([
      "must hold exactly 3 items — a BIS is a full build",
    ]);
    expect(messages(VALID.replace("[DA_Quicksilver, DA_Deathblade]", "[DA_Quicksilver]"))).toEqual([
      "needs at least 2 alternatives",
    ]);
  });

  it("rejects a role it doesn't know", () => {
    expect(messages(VALID.replace("role: AD Carry", "role: Support"))).toEqual([
      'must be one of "AP Carry", "AD Carry", "Main Tank", "Utility / Bruiser"',
    ]);
  });

  it("rejects an unquoted patch, which YAML would read as a number", () => {
    expect(messages(VALID.replace('patch: "18.2"', "patch: 18.10"))).toEqual([
      'must be a quoted string like "18.1" (unquoted, 18.10 would read as the number 18.1)',
    ]);
  });

  it("rejects a file with no champions in it", () => {
    expect(messages('patch: "18.2"\nchampions: []\n')).toEqual([
      "needs at least one champion; an empty file would render an empty page",
    ]);
  });
});
