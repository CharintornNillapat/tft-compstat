import { describe, expect, it } from "vitest";
import {
  buildChampionBisYaml,
  classifyRole,
  compareChampions,
  deriveBis,
  diffBis,
  readExistingBisNotes,
  type BisEntry,
  type BisItemInfo,
} from "./bis-sync";

/** Eight buckets of placements, so a row's average is whatever the test wants. */
const places = (average: number, games: number): number[] => {
  // Put every game on two adjacent placements that straddle the target average.
  const low = Math.floor(average);
  const share = average - low;
  const out = Array.from({ length: 8 }, () => 0);
  out[low - 1] = Math.round(games * (1 - share));
  out[low] = games - out[low - 1]!;
  return out;
};

const C = {
  bf: "DA_Component_BFSword",
  bow: "DA_Component_RecurveBow",
  rod: "DA_Component_NeedlesslyLargeRod",
  tear: "DA_Component_TearOfTheGoddess",
  vest: "DA_Component_ChainVest",
  cloak: "DA_Component_NegatronCloak",
  belt: "DA_Component_GiantsBelt",
  gloves: "DA_Component_SparringGloves",
};

const item = (kind: string, ...components: string[]): BisItemInfo => ({ kind, components });

const itemInfo = new Map<string, BisItemInfo>([
  ["DA_InfinityEdge", item("completed", C.bf, C.gloves)],
  ["DA_EdgeOfNight", item("completed", C.bf, C.vest)],
  ["DA_Quicksilver", item("completed", C.cloak, C.gloves)],
  ["DA_Deathblade", item("completed", C.bf, C.bf)],
  ["DA_RedBuff", item("completed", C.bow, C.bow)],
  ["DA_GiantSlayer", item("completed", C.bf, C.bow)],
  ["DA_RabadonsDeathcap", item("completed", C.rod, C.rod)],
  ["DA_BlueBuff", item("completed", C.tear, C.tear)],
  ["DA_BrambleVest", item("completed", C.vest, C.vest)],
  ["DA_GargoyleStoneplate", item("completed", C.vest, C.cloak)],
  ["DA_WarmogsArmor", item("completed", C.belt, C.belt)],
  ["DA_Artifact_LichBane", item("artifact")],
  ["DA_18_EmblemInferno", item("emblem", "DA_Component_Spatula")],
]);

describe("classifyRole", () => {
  it("reads a tank build off four defensive components", () => {
    // Bramble Vest + Gargoyle + Warmog's: vest, vest, vest, cloak, belt, belt.
    expect(classifyRole([C.vest, C.vest, C.vest, C.cloak, C.belt, C.belt])).toBe("Main Tank");
  });

  it("lets damage win a tie with defence — a carry holding a defensive item is a carry", () => {
    // Edge of Night + Infinity Edge + Quicksilver: 2 AD, 2 defensive, 2 gloves.
    expect(classifyRole([C.bf, C.vest, C.bf, C.gloves, C.cloak, C.gloves])).toBe("AD Carry");
  });

  it("separates AP from AD", () => {
    expect(classifyRole([C.rod, C.rod, C.tear, C.tear, C.rod, C.gloves])).toBe("AP Carry");
    expect(classifyRole([C.bf, C.bf, C.bow, C.bow, C.bf, C.gloves])).toBe("AD Carry");
  });

  it("calls an even AD/AP split and a damage-less build Utility / Bruiser", () => {
    expect(classifyRole([C.bf, C.bf, C.rod, C.rod, C.gloves, C.gloves])).toBe("Utility / Bruiser");
    expect(classifyRole([C.gloves, C.gloves, C.gloves, C.gloves, C.gloves, C.gloves])).toBe("Utility / Bruiser");
  });

  it("counts Sparring Gloves and Spatula for nothing", () => {
    expect(classifyRole([C.bf, C.gloves, C.gloves, C.gloves, C.gloves, C.gloves])).toBe("AD Carry");
  });
});

describe("deriveBis", () => {
  const builds = [
    // Most played by a distance, but it places worse.
    { items: ["DA_Deathblade", "DA_InfinityEdge", "DA_RedBuff"], places: places(4.2, 9000) },
    { items: ["DA_GiantSlayer", "DA_InfinityEdge", "DA_RedBuff"], places: places(3.1, 800) },
    // Better average, but nowhere near the games floor.
    { items: ["DA_EdgeOfNight", "DA_InfinityEdge", "DA_Quicksilver"], places: places(2.2, 30) },
  ];
  const items = [
    { apiName: "DA_Deathblade", places: places(3.6, 4000) },
    { apiName: "DA_Quicksilver", places: places(3.4, 3000) },
    { apiName: "DA_EdgeOfNight", places: places(3.9, 2000) },
    { apiName: "DA_InfinityEdge", places: places(3.0, 9000) },
  ];

  it("picks the best-placing full build, not the most-played one", () => {
    const { build } = deriveBis({ apiName: "DA_18_Ashe", builds, items, itemInfo });
    expect(build?.primary).toEqual(["DA_GiantSlayer", "DA_InfinityEdge", "DA_RedBuff"]);
    expect(build?.avgPlace).toBe(3.1);
    expect(build?.games).toBe(800);
    expect(build?.role).toBe("AD Carry");
  });

  it("offers the best single items that are not already in the build", () => {
    const { build } = deriveBis({ apiName: "DA_18_Ashe", builds, items, itemInfo });
    // Infinity Edge places best of all but is in the primary build, so it is not flex.
    expect(build?.secondary).toEqual(["DA_Quicksilver", "DA_Deathblade", "DA_EdgeOfNight"]);
  });

  it("ignores artifacts and emblems, which cannot be built from components", () => {
    const withArtifact = [
      { items: ["DA_Artifact_LichBane", "DA_InfinityEdge", "DA_18_EmblemInferno"], places: places(2.0, 5000) },
      ...builds,
    ];
    const { build } = deriveBis({ apiName: "DA_18_Ashe", builds: withArtifact, items, itemInfo });
    expect(build?.primary).toEqual(["DA_GiantSlayer", "DA_InfinityEdge", "DA_RedBuff"]);
  });

  it("skips a champion whose builds are all below the games floor, rather than guessing", () => {
    const thin = [{ items: ["DA_Deathblade", "DA_InfinityEdge", "DA_RedBuff"], places: places(3.0, 20) }];
    const { build, skip } = deriveBis({ apiName: "DA_Karma18", builds: thin, items, itemInfo });
    expect(build).toBeUndefined();
    expect(skip).toEqual({ apiName: "DA_Karma18", reason: "no 3-item build reached 200 games" });
  });

  it("skips a champion with too few alternatives to fill the flex slot", () => {
    const { build, skip } = deriveBis({
      apiName: "DA_18_Ashe",
      builds,
      items: [{ apiName: "DA_Quicksilver", places: places(3.4, 3000) }],
      itemInfo,
    });
    expect(build).toBeUndefined();
    expect(skip?.reason).toBe("only 1 alternative item(s) reached 500 games");
  });

  it("ignores a build that isn't three items — a BIS is a full build", () => {
    const pair = [{ items: ["DA_Deathblade", "DA_InfinityEdge"], places: places(2.0, 9000) }, ...builds];
    const { build } = deriveBis({ apiName: "DA_18_Ashe", builds: pair, items, itemInfo });
    expect(build?.primary).toEqual(["DA_GiantSlayer", "DA_InfinityEdge", "DA_RedBuff"]);
  });
});

describe("buildChampionBisYaml", () => {
  const entry: BisEntry = {
    apiName: "DA_18_Ashe",
    role: "AD Carry",
    primary: ["DA_GiantSlayer", "DA_InfinityEdge", "DA_RedBuff"],
    secondary: ["DA_Quicksilver", "DA_Deathblade"],
    avgPlace: 3.1,
    games: 800,
  };

  it("writes a file that says it is generated, and round-trips its notes", () => {
    const text = buildChampionBisYaml({
      patch: "18.2",
      entries: [{ ...entry, note: "Hold a Recurve Bow." }],
      provenance: ["Source: a test."],
    });
    expect(text).toContain("# GENERATED by `pnpm sync:bis`");
    expect(text).toContain('patch: "18.2"');
    expect(readExistingBisNotes(text)).toEqual({ DA_18_Ashe: "Hold a Recurve Bow." });
  });

  it("keeps no note for a champion that has none", () => {
    expect(readExistingBisNotes(buildChampionBisYaml({ patch: "18.2", entries: [entry], provenance: [] }))).toEqual({});
  });

  it("loses the notes rather than the run when the file no longer parses", () => {
    expect(readExistingBisNotes("champions: [ unterminated")).toEqual({});
    expect(readExistingBisNotes("")).toEqual({});
  });
});

describe("diffBis", () => {
  const entry: BisEntry = {
    apiName: "DA_18_Ashe",
    role: "AD Carry",
    primary: ["DA_GiantSlayer", "DA_InfinityEdge", "DA_RedBuff"],
    secondary: ["DA_Quicksilver", "DA_Deathblade"],
    avgPlace: 3.1,
    games: 800,
  };

  it("reports nothing when only the numbers moved, so a re-sync doesn't churn the file", () => {
    expect(diffBis([entry], [{ ...entry, avgPlace: 3.4, games: 1200 }])).toEqual([]);
  });

  it("reports a changed build, an added champion and a removed one", () => {
    const changed = { ...entry, primary: ["DA_Deathblade", "DA_InfinityEdge", "DA_RedBuff"] };
    expect(diffBis([entry], [changed]).map((c) => c.kind)).toEqual(["changed"]);
    expect(diffBis([], [entry]).map((c) => c.kind)).toEqual(["added"]);
    expect(diffBis([entry], []).map((c) => c.kind)).toEqual(["removed"]);
  });
});

describe("compareChampions", () => {
  it("sorts cheapest first, then by name, like the shop", () => {
    const rows = [
      { cost: 5, name: "Ashe" },
      { cost: 1, name: "Veigar" },
      { cost: 1, name: "Ornn" },
    ];
    expect([...rows].sort(compareChampions).map((r) => r.name)).toEqual(["Ornn", "Veigar", "Ashe"]);
  });
});
