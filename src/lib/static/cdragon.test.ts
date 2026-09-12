import { describe, expect, it } from "vitest";
import {
  buildStaticSnapshot,
  cdragonAssetUrl,
  cdragonPatch,
  cleanItemName,
  parseCdragonTft,
  pickSet,
  setDisplayName,
  traitBreakpoints,
} from "./cdragon";

// A trimmed-down en_us.json with the quirks seen in the real file.
const trait = (apiName: string, name: string, effects: [number | null, number][]) => ({
  apiName,
  name,
  icon: `assets/ux/traiticons/${apiName.toLowerCase()}.tex`,
  effects: effects.map(([minUnits, style]) => ({ minUnits, maxUnits: 25000, style })),
});

const champion = (apiName: string, name: string, cost: number, traits: string[]) => ({
  apiName,
  name,
  cost,
  traits,
  tileIcon: `ASSETS/Characters/${apiName}/${apiName}_Square.TEX`,
  squareIcon: null,
  icon: null,
  ability: { desc: "ignored" },
});

const item = (apiName: string, name: string | null, extra: Record<string, unknown> = {}) => ({
  apiName,
  name,
  icon: `assets/maps/tft/icons/items/${apiName.toLowerCase()}.tex`,
  composition: [],
  tags: [],
  associatedTraits: [],
  ...extra,
});

const set18 = {
  number: 18,
  mutator: "TFTSet18",
  name: "Set10",
  traits: [
    trait("DA_18_Hunter", "Hunter", [[2, 1], [null, 1], [3, 3], [4, 3], [5, 5]]),
    trait("DA_18_Rival", "Rival", [[1, 5], [1, 1], [2, 5]]),
    trait("DA_18_LuxUniqueTrait", "Avatar", [[1, 4]]),
    trait("DA_18_Blossom", "Blossom", [[3, 1], [5, 3], [7, 5], [11, 6]]),
    trait("DA_Riftbeast18", "Riftbeast", [[3, 1]]),
    trait("DA_18_Stargazer", "Stargazer", [[3, 1]]),
    trait("DA_18_Stargazer_Wolf", "Stargazer", [[3, 1]]),
  ],
  champions: [
    champion("DA_18_Ashe", "Ashe", 5, ["Blossom", "Hunter"]),
    champion("DA_18_KhaZix", "Kha'Zix", 3, ["Rival"]),
    champion("DA_Lux18_Base", "Lux", 5, ["Avatar"]),
    champion("DA_18_Seer", "Seer", 2, ["Stargazer", "Mystery"]),
    champion("DA_Krug18", "Krug", 3, ["Riftbeast"]), // playable, but never in the shop
    champion("TFT_TrainingDummy", "Target Dummy", 1, []),
    champion("TFT_ArmoryKeyOrnn", "Armory", 8, []),
  ],
  items: [
    "DA_Component_BFSword",
    "DA_InfinityEdge",
    "DA_InfinityEdgeRadiant",
    "TFT5_Item_ZzRotPortalRadiant",
    "DA_Artifact_Fishbones",
    "DA_18_EmblemHunter",
    "DA_18_EmblemBlossom",
    "DA_18_EmblemMystery",
    "TFT_Consumable_ItemRemover_UsesLeft2",
    "TFT7_Item_TreasureDragonBlankSlot",
    "DA_TacticiansCrown",
    "DA_Missing",
    "DA_InfinityEdge", // duplicates happen
  ],
};

const fixture = {
  items: [
    item("DA_Component_BFSword", "B.F. Sword", { tags: ["component"] }),
    item("DA_InfinityEdge", "Infinity Edge", {
      tags: ["{7ea41d13}", "CritChance"],
      composition: ["DA_Component_BFSword", "DA_Component_SparringGloves"],
    }),
    item("DA_InfinityEdgeRadiant", "Radiant Infinity Edge", { tags: ["{6ef5c598}", "{ec243f6b}"] }),
    // Support tag wins over the "Radiant" in its api name.
    item("TFT5_Item_ZzRotPortalRadiant", "Zz'Rot Portal", { tags: ["{27557a09}", "{d8d00bcc}"] }),
    item("DA_Artifact_Fishbones", "Fishbones", { tags: ["{44ace175}", "{ec243f6b}"] }),
    item("DA_18_EmblemHunter", "Hunter Emblem", {
      tags: ["{ebcd1bac}"],
      composition: ["DA_Component_Spatula", "DA_Component_RecurveBow"],
    }),
    item("DA_18_EmblemBlossom", "Blossom Emblem"), // untagged emblem: recognized by name
    item("DA_18_EmblemMystery", "Mystery Emblem", { tags: ["{ebcd1bac}"] }),
    item("TFT_Consumable_ItemRemover_UsesLeft2", "Magnetic Remover <rules>(2 uses left!)</rules>", {
      tags: ["Consumable"],
    }),
    item("TFT7_Item_TreasureDragonBlankSlot", ""),
    item("DA_TacticiansCrown", "Tacticians Crown", {
      tags: ["{ec243f6b}", "{d304f83b}"],
      composition: ["DA_Component_Spatula", "DA_Component_Spatula"],
    }),
  ],
  setData: [
    { ...set18, number: 17, mutator: "TFTSet17", name: "Set17", items: [] },
    set18,
    { ...set18, mutator: "TFTSet18_PAIRS" },
    { ...set18, number: 19, mutator: "TFTSet19_PVEMODE" }, // a mode, never picked as newest
  ],
};

const data = parseCdragonTft(fixture);
const PATCH = "16.18";
const playableIds = new Set(["DA_18_Ashe", "DA_18_KhaZix", "DA_Lux18_Base", "DA_18_Seer", "TFT17_Jinx"]);

describe("versions and asset URLs", () => {
  it("reads the game-data version", () => {
    expect(cdragonPatch("16.18.8165012+branch.releases-16-18.content.release")).toBe("16.18");
    expect(() => cdragonPatch("latest")).toThrowError(/Unrecognized/);
  });

  it("builds lowercase PNG URLs pinned to the patch directory", () => {
    expect(cdragonAssetUrl("ASSETS/Characters/TFT18_Ashe/TFT18_Ashe_Square.TEX", PATCH)).toBe(
      "https://raw.communitydragon.org/16.18/game/assets/characters/tft18_ashe/tft18_ashe_square.png",
    );
    expect(cdragonAssetUrl("assets/ux/icon.dds", PATCH)).toMatch(/\/assets\/ux\/icon\.png$/);
    expect(cdragonAssetUrl(null, PATCH)).toBeNull();
    expect(cdragonAssetUrl("", PATCH)).toBeNull();
  });
});

describe("traitBreakpoints", () => {
  it("maps CommunityDragon style codes to names and sorts by unit count", () => {
    expect(traitBreakpoints([{ minUnits: 7, style: 5 }, { minUnits: 3, style: 1 }, { minUnits: 11, style: 6 }])).toEqual([
      { min: 3, style: "bronze" },
      { min: 7, style: "gold" },
      { min: 11, style: "prismatic" },
    ]);
    expect(traitBreakpoints([{ minUnits: 1, style: 4 }])).toEqual([{ min: 1, style: "unique" }]);
  });

  it("drops effects without a unit count or a known style, and keeps one entry per count", () => {
    expect(
      traitBreakpoints([
        { minUnits: null, style: 1 },
        { minUnits: 2, style: 9 },
        { minUnits: 1, style: 5 },
        { minUnits: 1, style: 1 },
        { minUnits: 2, style: 5 },
      ]),
    ).toEqual([
      { min: 1, style: "bronze" },
      { min: 2, style: "gold" },
    ]);
  });
});

describe("pickSet / setDisplayName", () => {
  it("picks the newest standard set, ignoring mode variants", () => {
    expect(pickSet(data).mutator).toBe("TFTSet18");
    expect(pickSet(data, 17).mutator).toBe("TFTSet17");
  });

  it("names the available sets when the requested one is missing", () => {
    expect(() => pickSet(data, 19)).toThrowError(/Set 19 not found.*17, 18/);
  });

  it("replaces internal set names", () => {
    expect(setDisplayName(18, "Set10")).toBe("Enchanted Wilds");
    expect(setDisplayName(21, "Set21")).toBe("Set 21");
    expect(setDisplayName(3, "Galaxies")).toBe("Galaxies");
  });
});

describe("buildStaticSnapshot", () => {
  const snapshot = buildStaticSnapshot(data, { patch: PATCH, playableIds });

  it("describes the set", () => {
    expect(snapshot.set).toEqual({
      id: 18,
      mutator: "TFTSet18",
      name: "Enchanted Wilds",
      patch: PATCH,
      is_active: true,
    });
  });

  it("keeps every playable unit and maps trait names to api names", () => {
    expect(snapshot.champions.map((c) => c.api_name)).toEqual([
      "DA_18_Ashe",
      "DA_18_KhaZix",
      "DA_Lux18_Base",
      "DA_18_Seer",
      "DA_Krug18",
    ]);
    expect(snapshot.champions[0]).toEqual({
      api_name: "DA_18_Ashe",
      set_id: 18,
      name: "Ashe",
      cost: 5,
      traits: ["DA_18_Blossom", "DA_18_Hunter"],
      icon_url: "https://raw.communitydragon.org/16.18/game/assets/characters/da_18_ashe/da_18_ashe_square.png",
      is_shop_unit: true,
    });
  });

  it("marks playable units Data Dragon does not sell as non-shop", () => {
    // The traitless legacy summons and the cost-8/11 anvils are excluded outright;
    // Krug is a real board unit, so it is stored with is_shop_unit false (§4.8, §11).
    const byName = Object.fromEntries(snapshot.champions.map((c) => [c.api_name, c.is_shop_unit]));
    expect(byName).toEqual({
      DA_18_Ashe: true,
      DA_18_KhaZix: true,
      DA_Lux18_Base: true,
      DA_18_Seer: true,
      DA_Krug18: false,
    });
    expect(snapshot.champions.find((c) => c.api_name === "TFT_TrainingDummy")).toBeUndefined();
    expect(snapshot.champions.find((c) => c.api_name === "TFT_ArmoryKeyOrnn")).toBeUndefined();
  });

  it("resolves duplicate trait names to the shortest api name and warns about unknown ones", () => {
    const seer = snapshot.champions.find((c) => c.api_name === "DA_18_Seer");
    expect(seer?.traits).toEqual(["DA_18_Stargazer"]);
    expect(snapshot.warnings).toContainEqual(expect.stringMatching(/"Stargazer" is shared/));
    expect(snapshot.warnings).toContainEqual(expect.stringMatching(/DA_18_Seer: unknown trait "Mystery"/));
  });

  it("keeps every trait of the set with normalized breakpoints", () => {
    expect(snapshot.traits).toHaveLength(7);
    expect(snapshot.traits.find((t) => t.api_name === "DA_18_Hunter")?.breakpoints).toEqual([
      { min: 2, style: "bronze" },
      { min: 3, style: "silver" },
      { min: 4, style: "silver" },
      { min: 5, style: "gold" },
    ]);
  });

  it("marks every unit as a shop unit when Data Dragon lists nothing for the set", () => {
    const fallback = buildStaticSnapshot(data, { patch: PATCH, playableIds: new Set(["TFT17_Jinx"]) });
    expect(fallback.champions.every((c) => c.is_shop_unit)).toBe(true);
    expect(fallback.warnings).toContainEqual(expect.stringMatching(/Data Dragon lists no set 18 units/));

    // Same when Data Dragon is unreachable, but then there is nothing to warn about.
    const unknown = buildStaticSnapshot(data, { patch: PATCH });
    expect(unknown.champions.every((c) => c.is_shop_unit)).toBe(true);
    expect(unknown.warnings).not.toContainEqual(expect.stringMatching(/Data Dragon/));
  });

  it("classifies items by tag, then by api name and recipe", () => {
    const kinds = Object.fromEntries(snapshot.items.map((i) => [i.api_name, i.kind]));
    expect(kinds).toEqual({
      DA_Component_BFSword: "component",
      DA_InfinityEdge: "completed",
      DA_InfinityEdgeRadiant: "radiant",
      TFT5_Item_ZzRotPortalRadiant: "support",
      DA_Artifact_Fishbones: "artifact",
      DA_18_EmblemHunter: "emblem",
      DA_18_EmblemBlossom: "emblem",
      DA_18_EmblemMystery: "emblem",
      TFT_Consumable_ItemRemover_UsesLeft2: "other",
      TFT7_Item_TreasureDragonBlankSlot: "other",
      DA_TacticiansCrown: "completed",
    });
  });

  it("links emblems to the trait they grant", () => {
    const grants = Object.fromEntries(snapshot.items.map((i) => [i.api_name, i.grants_trait]));
    expect(grants.DA_18_EmblemHunter).toBe("DA_18_Hunter");
    expect(grants.DA_18_EmblemBlossom).toBe("DA_18_Blossom");
    expect(grants.DA_18_EmblemMystery).toBeNull();
    expect(grants.DA_InfinityEdge).toBeNull();
    expect(snapshot.warnings).toContainEqual(expect.stringMatching(/Emblem DA_18_EmblemMystery .* matches no trait/));
  });

  it("dedupes the pool, skips missing items and cleans names", () => {
    expect(snapshot.items.filter((i) => i.api_name === "DA_InfinityEdge")).toHaveLength(1);
    expect(snapshot.items.find((i) => i.api_name === "DA_Missing")).toBeUndefined();
    expect(snapshot.warnings).toContainEqual(expect.stringMatching(/DA_Missing is in the set's pool but missing/));
    expect(cleanItemName("Magnetic Remover <rules>(2 uses left!)</rules>", "x")).toBe("Magnetic Remover (2 uses left!)");
    expect(cleanItemName("", "TFT7_Item_TreasureDragonBlankSlot")).toBe("TFT7_Item_TreasureDragonBlankSlot");
    expect(snapshot.items.find((i) => i.api_name === "DA_InfinityEdge")?.components).toEqual([
      "DA_Component_BFSword",
      "DA_Component_SparringGloves",
    ]);
  });

  it("rejects a changed source format with a readable error", () => {
    const broken = { ...fixture, setData: [{ ...set18, champions: [{ apiName: "X", cost: "5" }] }] };
    expect(() => buildStaticSnapshot(parseCdragonTft(broken), { patch: PATCH })).toThrowError(
      /Unexpected CommunityDragon format \(TFTSet18\)[\s\S]*champions/,
    );
  });
});
