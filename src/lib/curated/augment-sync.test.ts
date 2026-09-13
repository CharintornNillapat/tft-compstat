import { describe, expect, it } from "vitest";
import {
  augmentFamily,
  augmentRarity,
  augmentTiersFingerprint,
  buildAugmentTiersYaml,
  feedTier,
  guideCarries,
  guideConsensus,
  guideFitsBoard,
  pickCompAugments,
  resolveAugmentTiers,
  type AugmentEntry,
  type AugmentInfo,
} from "./augment-sync";
import { parseAugmentTiers } from "./augment-tiers";

const ICON = (name: string) => `https://raw.communitydragon.org/16.18/game/assets/maps/tft/icons/augments/hexcore/${name}.png`;

const info = (name: string, rarity: AugmentInfo["rarity"] = "Gold", description: string | null = null): AugmentInfo => ({
  name,
  rarity,
  iconUrl: ICON(name.toLowerCase().replace(/\W+/g, "-")),
  description,
});

describe("augmentRarity", () => {
  it("reads the hashed CommunityDragon rarity tag, whatever else is tagged", () => {
    expect(augmentRarity(["{b72bd3bf}", "{d11fd6d5}"])).toBe("Silver");
    expect(augmentRarity(["{ce1fd21c}"])).toBe("Gold");
    expect(augmentRarity(["{38baf02e}", "{cf1fd3af}"])).toBe("Prismatic");
    expect(augmentRarity(["{b72bd3bf}"])).toBeUndefined();
    expect(augmentRarity(null)).toBeUndefined();
  });
});

describe("feedTier", () => {
  it("maps S-C straight across and folds D into C", () => {
    expect(["S", "a", " B ", "C", "D"].map(feedTier)).toEqual(["S", "A", "B", "C", "C"]);
    expect(feedTier("E")).toBeUndefined();
    expect(feedTier("")).toBeUndefined();
  });
});

describe("resolveAugmentTiers", () => {
  const known = new Map<string, AugmentInfo>([
    ["DA_PandorasBench", info("Pandora's Bench")],
    ["DA_LevelUp", info("Level Up!", "Prismatic")],
    ["DA_CalledShot", info("Called Shot", "Silver")],
    // Spread rather than `info("Untagged", undefined)`: an undefined argument takes the default.
    ["DA_Untagged", { ...info("Untagged"), rarity: undefined }],
    ["DA_Late", info("Late Bloomer", "Silver")],
  ]);

  const { entries, skipped } = resolveAugmentTiers(
    [
      { label: "D", ids: ["DA_Late"] },
      { label: "S", ids: ["DA_PandorasBench", "DA_Unknown", "DA_LevelUp"] },
      { label: "B", ids: ["DA_CalledShot", "DA_Untagged", "DA_PandorasBench"] },
      { label: "Z", ids: ["DA_Weird"] },
    ],
    known,
  );

  it("runs best tier first, keeps the author's order inside a tier, and puts D rows under C", () => {
    expect(entries.map((entry) => [entry.apiName, entry.tier])).toEqual([
      ["DA_PandorasBench", "S"],
      ["DA_LevelUp", "S"],
      ["DA_CalledShot", "B"],
      ["DA_Late", "C"],
    ]);
  });

  it("keeps an augment graded twice at its best grade, once", () => {
    expect(entries.filter((entry) => entry.apiName === "DA_PandorasBench")).toHaveLength(1);
  });

  it("skips and reports unknown augments, missing rarities and unreadable grades", () => {
    expect(skipped).toEqual([
      { apiName: "DA_Weird", reason: 'unknown grade "Z"' },
      { apiName: "DA_Unknown", reason: "not in the CommunityDragon game data" },
      { apiName: "DA_Untagged", reason: "no rarity tag" },
    ]);
  });
});

describe("augmentFamily", () => {
  it("treats + variants and roman-numeral ranks as one augment", () => {
    expect(augmentFamily("Branching Out+")).toBe("branching out");
    expect(augmentFamily("Branching Out++")).toBe("branching out");
    expect(augmentFamily("Celestial Blessing II")).toBe("celestial blessing");
    expect(augmentFamily("Glass Cannon")).toBe("glass cannon");
  });

  it("does not eat a word that merely ends in i", () => {
    expect(augmentFamily("Pandora's Bench")).toBe("pandora's bench");
    expect(augmentFamily("Kiwi")).toBe("kiwi");
  });
});

describe("pickCompAugments", () => {
  const entry = (apiName: string, name: string, tier: AugmentEntry["tier"]): AugmentEntry => ({
    apiName,
    name,
    tier,
    rarity: "Gold",
    iconUrl: null,
    description: null,
  });
  const global = new Map(
    [
      entry("DA_EconS", "Econ", "S"),
      entry("DA_TraitC", "Trait Crest", "C"),
      entry("DA_ItemsA", "Item Pack", "A"),
      entry("DA_ItemsAPlus", "Item Pack+", "A"),
      entry("DA_CombatB", "Combat", "B"),
      entry("DA_RerollB", "Reroll", "B"),
      entry("DA_ScaleA", "Scale", "A"),
      entry("DA_ExtraS", "Extra", "S"),
    ].map((row) => [row.apiName, row]),
  );

  it("orders by the comp's grade, then by how far above the other guides this one rates it", () => {
    // Econ is S in every guide; Trait Crest is S in this one and ungraded in most others.
    const consensus = new Map([
      ["DA_EconS", 0],
      ["DA_TraitC", 3.5],
      ["DA_ItemsA", 1],
      ["DA_CombatB", 2.5],
      ["DA_ScaleA", 1],
    ]);
    const picks = pickCompAugments(
      [
        { id: "DA_EconS", tier: "S" },
        { id: "DA_ItemsA", tier: "S" },
        { id: "DA_TraitC", tier: "S" },
        { id: "DA_CombatB", tier: "A" },
        { id: "DA_ScaleA", tier: "A" },
      ],
      global,
      consensus,
    );
    // S for the comp: Trait Crest (+3.5), Item Pack (+1), Econ (+0).
    // A for the comp: Combat (+1.5) before Scale (+0).
    expect(picks).toEqual(["DA_TraitC", "DA_ItemsA", "DA_EconS", "DA_CombatB", "DA_ScaleA"]);
  });

  it("shows one per family, skips augments the global list lacks, and stops at max", () => {
    const picks = pickCompAugments(
      [
        { id: "DA_ItemsA", tier: "S" },
        { id: "DA_ItemsAPlus", tier: "S" },
        { id: "DA_NotListed", tier: "S" },
        { id: "DA_EconS", tier: "A" },
        { id: "DA_ExtraS", tier: "A" },
        { id: "DA_CombatB", tier: "B" },
        { id: "DA_RerollB", tier: "B" },
        { id: "DA_ScaleA", tier: "B" },
      ],
      global,
      new Map(),
      { min: 4, max: 5 },
    );
    // No consensus, so no lift: inside a grade the global tier decides (Scale is A), then guide order.
    expect(picks).toEqual(["DA_ItemsA", "DA_EconS", "DA_ExtraS", "DA_ScaleA", "DA_CombatB"]);
  });

  it("returns null for a stub guide under the minimum", () => {
    expect(
      pickCompAugments(
        [
          { id: "DA_EconS", tier: "S" },
          { id: "DA_ItemsA", tier: "S" },
          { id: "DA_ItemsAPlus", tier: "S" },
          { id: "DA_Nope", tier: "S" },
          { id: "DA_CombatB", tier: "?" },
        ],
        global,
        new Map(),
      ),
    ).toBeNull();
  });
});

describe("guideConsensus", () => {
  it("averages each augment's rank over distinct guides, ungraded counting as below C", () => {
    const shared = { source: "AHRI & Morgana > Blossom", augments: [{ id: "Econ", tier: "S" }, { id: "Crest", tier: "S" }] };
    const consensus = guideConsensus([
      shared,
      // The same guide handed to a second cluster must not count twice.
      { ...shared },
      { source: "SIVIR > Hunter", augments: [{ id: "Econ", tier: "S" }, { id: "Combat", tier: "D" }] },
    ]);
    expect(Object.fromEntries(consensus)).toEqual({ Econ: 0, Crest: 2, Combat: 3.5 });
  });

  it("is empty with no guides", () => {
    expect(guideConsensus([]).size).toBe(0);
  });
});

describe("guideCarries", () => {
  it("reads the carries before the first >, with & as required and / as alternatives", () => {
    expect(guideCarries("ZYRA & SORAKA > Executioner > Lvl 8 push")).toEqual([["zyra"], ["soraka"]]);
    expect(guideCarries("CINDERLING / PEBBLES > Riftbeast > Lvl 8 push")).toEqual([["cinderling", "pebbles"]]);
    expect(guideCarries("MASTER YI > Adaptor > Lvl 7 reroll")).toEqual([["masteryi"]]);
  });

  it("names nothing for a missing or empty title", () => {
    expect(guideCarries(null)).toEqual([]);
    expect(guideCarries("  > Solar")).toEqual([]);
  });
});

describe("guideFitsBoard", () => {
  const board = ["Ahri", "Morgana", "Master Yi", "Kha'Zix", "Pebbles"];

  it("fits when every named carry is fielded, matching names loosely", () => {
    expect(guideFitsBoard("AHRI & Morgana > Blossom > Lvl 8 push", board)).toBe(true);
    expect(guideFitsBoard("MASTER YI > Adaptor", board)).toBe(true);
    expect(guideFitsBoard("KHAZIX > Slayer", board)).toBe(true);
    expect(guideFitsBoard("CINDERLING / PEBBLES > Riftbeast", board)).toBe(true);
  });

  it("does not fit a board missing any required carry, or a guide that names none", () => {
    expect(guideFitsBoard("AHRI & Morgana > Blossom", ["Malphite", "Ahri"])).toBe(false);
    expect(guideFitsBoard("ZYRA & SORAKA > Executioner", board)).toBe(false);
    expect(guideFitsBoard(null, board)).toBe(false);
  });
});

describe("buildAugmentTiersYaml", () => {
  const entries: AugmentEntry[] = [
    { apiName: "DA_PandorasBench", name: "Pandora's Bench", rarity: "Gold", tier: "S", iconUrl: ICON("pandora"), description: "Gain 2 rerolls." },
    { apiName: "DA_LevelUp", name: "Level Up!", rarity: "Prismatic", tier: "S", iconUrl: ICON("levelup"), description: null },
    { apiName: "DA_CalledShot", name: "Called Shot", rarity: "Silver", tier: "B", iconUrl: null, description: null },
    { apiName: "DA_Econ", name: "Econ", rarity: "Silver", tier: "C", iconUrl: null, description: null },
  ];
  const source = (sourceLine: string) => ({
    patch: "18.2",
    source: sourceLine,
    provenance: ["Source: test."],
    entries,
    comps: [
      { slug: "draven-fast-9", source: "DRAVEN > Legendaries > Lvl 9", augments: ["DA_LevelUp", "DA_PandorasBench", "DA_CalledShot", "DA_Econ"] },
    ],
  });
  const text = buildAugmentTiersYaml(source("MetaTFT grades, updated 07:30."));

  it("writes a file the site's own parser accepts, round-tripping every field", () => {
    const { tiers, issues } = parseAugmentTiers("augment-tiers.yaml", text);
    expect(issues).toEqual([]);
    expect(tiers?.patch).toBe("18.2");
    expect(tiers?.augments.map((a) => a.apiName)).toEqual(entries.map((e) => e.apiName));
    expect(tiers?.augments[0]).toEqual(entries[0]);
    expect(tiers?.comps["draven-fast-9"]?.augments.map((a) => a.name)).toEqual([
      "Level Up!",
      "Pandora's Bench",
      "Called Shot",
      "Econ",
    ]);
    expect(tiers?.comps["draven-fast-9"]?.source).toBe("DRAVEN > Legendaries > Lvl 9");
  });

  it("marks the file generated, quotes the patch and writes a comp's picks on one line", () => {
    expect(text.startsWith("# GENERATED by `pnpm sync:meta`")).toBe(true);
    expect(text).toMatch(/^patch: "18\.2"$/m);
    expect(text).toMatch(/augments: \[ DA_LevelUp, DA_PandorasBench, DA_CalledShot, DA_Econ \]/);
    expect(text).not.toMatch(/description: null/);
  });

  it("fingerprints the ratings, not the source line that moves every run", () => {
    const later = buildAugmentTiersYaml(source("MetaTFT grades, updated 09:45."));
    expect(augmentTiersFingerprint(later)).toBe(augmentTiersFingerprint(text));
    const moved = buildAugmentTiersYaml({ ...source("x"), entries: [...entries].reverse() });
    expect(augmentTiersFingerprint(moved)).not.toBe(augmentTiersFingerprint(text));
    expect(augmentTiersFingerprint("a: [unclosed")).toBeUndefined();
  });
});
