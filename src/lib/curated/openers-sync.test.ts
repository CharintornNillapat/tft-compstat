import { describe, expect, it } from "vitest";
import {
  buildOpenersYaml,
  clusterEarlyComps,
  deriveOpenerName,
  deriveOpenerNotes,
  deriveOpeners,
  deriveOpenerTier,
  deriveSlammableItems,
  deriveTransitionSlugs,
  type OpenerCluster,
  type OpenerCompData,
  type OpenerReferenceData,
} from "./openers-sync";
import { openersFileSchema } from "./schemas";
import { parseYaml } from "./validate";

const mockReferences: OpenerReferenceData = {
  championNames: new Map([
    ["DA_Karma18", "Karma"],
    ["DA_18_Yorick", "Yorick"],
    ["DA_18_Yunara", "Yunara"],
    ["DA_18_Ornn", "Ornn"],
    ["DA_18_Xayah", "Xayah"],
    ["DA_18_Alistar", "Alistar"],
    ["DA_18_Draven", "Draven"], // 5-cost
  ]),
  championCosts: new Map([
    ["DA_Karma18", 1],
    ["DA_18_Yorick", 2],
    ["DA_18_Yunara", 2],
    ["DA_18_Ornn", 1],
    ["DA_18_Xayah", 1],
    ["DA_18_Alistar", 2],
    ["DA_18_Draven", 5],
  ]),
  championTraits: new Map([
    ["DA_Karma18", ["Trait_Blossom", "Trait_Invoker"]],
    ["DA_18_Yorick", ["Trait_Blossom", "Trait_Warden"]],
    ["DA_18_Yunara", ["Trait_Blossom", "Trait_Invoker"]],
    ["DA_18_Ornn", ["Trait_Elderwood", "Trait_Vanguard"]],
    ["DA_18_Xayah", ["Trait_Elderwood", "Trait_Hunter"]],
    ["DA_18_Alistar", ["Trait_Elderwood", "Trait_Vanguard"]],
    ["DA_18_Draven", ["Trait_Noxus"]],
  ]),
  traitNames: new Map([
    ["Trait_Blossom", "Blossom"],
    ["Trait_Invoker", "Invoker"],
    ["Trait_Warden", "Warden"],
    ["Trait_Elderwood", "Elderwood"],
    ["Trait_Vanguard", "Vanguard"],
    ["Trait_Hunter", "Hunter"],
    ["Trait_Noxus", "Noxus"],
  ]),
  itemNames: new Map([
    ["DA_SunfireCape", "Sunfire Cape"],
    ["DA_GuinsoosRageblade", "Guinsoo's Rageblade"],
    ["DA_SpearOfShojin", "Spear of Shojin"],
    ["DA_LastWhisper", "Last Whisper"],
    ["DA_WarmogsArmor", "Warmog's Armor"],
    ["DA_BlossomEmblem", "Blossom Emblem"],
  ]),
  itemKinds: new Map([
    ["DA_SunfireCape", "completed"],
    ["DA_GuinsoosRageblade", "completed"],
    ["DA_SpearOfShojin", "completed"],
    ["DA_LastWhisper", "completed"],
    ["DA_WarmogsArmor", "completed"],
    ["DA_BlossomEmblem", "emblem"],
  ]),
};

const mockComps: OpenerCompData[] = [
  {
    slug: "blossom-ashe",
    name: "Blossom Ashe",
    tier: "S",
    pickRate: 15.2,
    avgPlace: 4.12,
    earlyUnits: ["DA_Karma18", "DA_18_Yorick", "DA_18_Yunara"],
    carries: [
      { apiName: "DA_18_Ashe", priority: 1, items: ["DA_SpearOfShojin", "DA_LastWhisper", "DA_BlossomEmblem"] },
      { apiName: "DA_Karma18", priority: 2, items: ["DA_SpearOfShojin", "DA_GuinsoosRageblade"] },
    ],
  },
  {
    slug: "blossom-sivir",
    name: "Blossom Sivir",
    tier: "A",
    pickRate: 8.5,
    avgPlace: 4.35,
    earlyUnits: ["DA_Karma18", "DA_18_Yorick", "DA_18_Yunara"],
    carries: [
      { apiName: "DA_18_Sivir", priority: 1, items: ["DA_GuinsoosRageblade", "DA_LastWhisper"] },
    ],
  },
  {
    slug: "elderwood-vanguard",
    name: "Elderwood Vanguard",
    tier: "A",
    pickRate: 6.0,
    avgPlace: 4.45,
    earlyUnits: ["DA_18_Ornn", "DA_18_Xayah", "DA_18_Alistar"],
    carries: [
      { apiName: "DA_18_Xayah", priority: 1, items: ["DA_GuinsoosRageblade", "DA_SunfireCape"] },
    ],
  },
  {
    slug: "invalid-comp",
    name: "Invalid Comp",
    tier: "B",
    pickRate: 1.0,
    avgPlace: 4.9,
    // Only 1 valid unit (Draven is 5-cost) -> filtered out (< 3 valid units)
    earlyUnits: ["DA_18_Ornn", "DA_18_Draven"],
    carries: [],
  },
];

describe("clusterEarlyComps", () => {
  it("clusters comps by identical 1- and 2-cost early units", () => {
    const clusters = clusterEarlyComps(mockComps, mockReferences);
    expect(clusters).toHaveLength(2);

    // First cluster should be the Blossom one (has S tier comp and higher pick rate)
    const blossomCluster = clusters[0]!;
    expect(blossomCluster.comps).toHaveLength(2);
    expect(blossomCluster.bestTier).toBe("S");
    expect(blossomCluster.totalPickRate).toBeCloseTo(23.7);
    expect(blossomCluster.coreUnits).toEqual(["DA_Karma18", "DA_18_Yorick", "DA_18_Yunara"]);

    // Second cluster should be Elderwood
    const elderwoodCluster = clusters[1]!;
    expect(elderwoodCluster.comps).toHaveLength(1);
    expect(elderwoodCluster.bestTier).toBe("A");
    expect(elderwoodCluster.totalPickRate).toBe(6.0);
  });

  it("excludes units with cost > 2 and ignores comps with fewer than 3 valid units", () => {
    const compWithHighCost: OpenerCompData = {
      slug: "high-cost",
      name: "High Cost",
      tier: "S",
      earlyUnits: ["DA_Karma18", "DA_18_Yorick", "DA_18_Draven"], // Draven is 5-cost, leaving only 2 units
      carries: [],
    };
    const clusters = clusterEarlyComps([compWithHighCost], mockReferences);
    expect(clusters).toHaveLength(0);
  });
});

describe("deriveOpenerName", () => {
  it("creates name from 2 shared active traits", () => {
    // Karma (Blossom, Invoker), Yorick (Blossom, Warden), Yunara (Blossom, Invoker)
    // Blossom: 3, Invoker: 2 -> "Blossom Invokers"
    const name = deriveOpenerName(["DA_Karma18", "DA_18_Yorick", "DA_18_Yunara"], mockReferences);
    expect(name).toBe("Blossom Invokers");
  });

  it("creates swarm name if 1 trait has >= 3 units", () => {
    const refs: OpenerReferenceData = {
      ...mockReferences,
      championTraits: new Map([
        ["DA_Karma18", ["Trait_Blossom"]],
        ["DA_18_Yorick", ["Trait_Blossom"]],
        ["DA_18_Yunara", ["Trait_Blossom"]],
      ]),
    };
    const name = deriveOpenerName(["DA_Karma18", "DA_18_Yorick", "DA_18_Yunara"], refs);
    expect(name).toBe("Blossom Swarm");
  });

  it("creates core name if 1 trait has 2 units", () => {
    const refs: OpenerReferenceData = {
      ...mockReferences,
      championTraits: new Map([
        ["DA_Karma18", ["Trait_Blossom"]],
        ["DA_18_Yorick", ["Trait_Blossom"]],
        ["DA_18_Ornn", ["Trait_Elderwood"]],
      ]),
    };
    const name = deriveOpenerName(["DA_Karma18", "DA_18_Yorick", "DA_18_Ornn"], refs);
    expect(name).toBe("Blossom Core");
  });

  it("falls back to lead unit board name if no shared traits", () => {
    const refs: OpenerReferenceData = {
      ...mockReferences,
      championTraits: new Map([
        ["DA_Karma18", ["Trait_Blossom"]],
        ["DA_18_Ornn", ["Trait_Elderwood"]],
        ["DA_18_Yorick", ["Trait_Warden"]],
      ]),
    };
    // Yorick is 2-cost (highest among Karma 1, Ornn 1, Yorick 2)
    const name = deriveOpenerName(["DA_Karma18", "DA_18_Ornn", "DA_18_Yorick"], refs);
    expect(name).toBe("Yorick Board");
  });
});

describe("deriveOpenerTier", () => {
  it("rates top clusters with S tier or >=20 pick rate as S", () => {
    const clusterS: OpenerCluster = {
      coreUnits: ["u1", "u2", "u3"],
      comps: [],
      totalPickRate: 15,
      bestTier: "S",
      avgPlace: 4.2,
    };
    expect(deriveOpenerTier(0, clusterS)).toBe("S");
    expect(deriveOpenerTier(2, clusterS)).toBe("S");

    const clusterHighPR: OpenerCluster = {
      coreUnits: ["u1", "u2", "u3"],
      comps: [],
      totalPickRate: 25,
      bestTier: "A",
      avgPlace: 4.2,
    };
    expect(deriveOpenerTier(1, clusterHighPR)).toBe("S");
  });

  it("rates top 6 or A tier as A", () => {
    const clusterA: OpenerCluster = {
      coreUnits: ["u1", "u2", "u3"],
      comps: [],
      totalPickRate: 5,
      bestTier: "A",
      avgPlace: 4.4,
    };
    expect(deriveOpenerTier(4, clusterA)).toBe("A");
  });

  it("rates lower clusters as B", () => {
    const clusterB: OpenerCluster = {
      coreUnits: ["u1", "u2", "u3"],
      comps: [],
      totalPickRate: 3,
      bestTier: "B",
      avgPlace: 4.7,
    };
    expect(deriveOpenerTier(6, clusterB)).toBe("B");
  });
});

describe("deriveSlammableItems", () => {
  it("extracts completed items weighted by carry priority and ignores emblems", () => {
    const clusters = clusterEarlyComps(mockComps, mockReferences);
    const blossomCluster = clusters[0]!;
    const items = deriveSlammableItems(blossomCluster, mockReferences);

    expect(items).toContain("DA_SpearOfShojin");
    expect(items).toContain("DA_LastWhisper");
    expect(items).not.toContain("DA_BlossomEmblem"); // emblem excluded
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items.length).toBeLessThanOrEqual(3);
  });

  it("pads with fallback completed items when fewer than 2 items exist", () => {
    const clusterEmptyCarries: OpenerCluster = {
      coreUnits: ["DA_18_Ornn", "DA_18_Xayah", "DA_18_Alistar"],
      comps: [
        {
          slug: "bare-comp",
          name: "Bare",
          tier: "B",
          earlyUnits: ["DA_18_Ornn", "DA_18_Xayah", "DA_18_Alistar"],
          carries: [],
        },
      ],
      totalPickRate: 1,
      bestTier: "B",
      avgPlace: 4.6,
    };
    const items = deriveSlammableItems(clusterEmptyCarries, mockReferences);
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items.length).toBeLessThanOrEqual(3);
    expect(items).toContain("DA_SunfireCape");
  });
});

describe("deriveTransitionSlugs", () => {
  it("picks member comp slugs first and supplements if needed", () => {
    const clusters = clusterEarlyComps(mockComps, mockReferences);
    const blossomCluster = clusters[0]!;
    const slugs = deriveTransitionSlugs(blossomCluster, mockComps);

    expect(slugs).toEqual(["blossom-ashe", "blossom-sivir"]);
  });

  it("supplements transition slugs if cluster has only 1 comp", () => {
    const clusters = clusterEarlyComps(mockComps, mockReferences);
    const elderwoodCluster = clusters[1]!;

    // Supplement comp sharing 2 units
    const extraComp: OpenerCompData = {
      slug: "elderwood-flex",
      name: "Elderwood Flex",
      tier: "S",
      earlyUnits: ["DA_18_Ornn", "DA_18_Xayah", "DA_Karma18"], // shares Ornn and Xayah
      carries: [],
    };
    const allComps = [...mockComps, extraComp];
    const slugs = deriveTransitionSlugs(elderwoodCluster, allComps);

    expect(slugs).toContain("elderwood-vanguard");
    expect(slugs).toContain("elderwood-flex");
    expect(slugs.length).toBeLessThanOrEqual(3);
  });
});

describe("deriveOpenerNotes", () => {
  it("generates notes within 96 chars containing carry, tank, and pivot target", () => {
    const clusters = clusterEarlyComps(mockComps, mockReferences);
    const blossomCluster = clusters[0]!;
    const notes = deriveOpenerNotes(blossomCluster, mockReferences, "Blossom Ashe");

    expect(notes.length).toBeLessThanOrEqual(96);
    expect(notes).toContain("Blossom Ashe");
  });
});

describe("deriveOpeners & buildOpenersYaml", () => {
  it("derives openers end-to-end and serializes valid YAML matching schema", () => {
    const openers = deriveOpeners(mockComps, mockReferences, "18.2", 8);
    expect(openers).toHaveLength(2);

    const yamlText = buildOpenersYaml({ patch: "18.2", openers });
    expect(yamlText).toContain("# GENERATED by `pnpm sync:openers`");
    expect(yamlText).toContain('patch: "18.2"');

    const parsedYaml = parseYaml("test.yaml", yamlText);
    expect(parsedYaml.syntaxIssues).toHaveLength(0);

    const schemaResult = openersFileSchema.safeParse(parsedYaml.data);
    expect(schemaResult.success).toBe(true);
  });
});
