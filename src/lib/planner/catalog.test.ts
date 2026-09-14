import { describe, expect, it } from "vitest";
import { CATALOG } from "./catalog.fixture";
import { championLabels, filterChampions, filterItems, plannerItemPool, traitOptions, type ItemRow } from "./catalog";

const row = (api_name: string, name: string, kind: ItemRow["kind"], grants_trait: string | null = null): ItemRow => ({
  api_name,
  name,
  icon_url: null,
  kind,
  grants_trait,
});

describe("plannerItemPool", () => {
  it("offers DA_ completed items, emblems and artifacts only, grouped by kind then name", () => {
    const pool = plannerItemPool([
      row("DA_Deathblade", "Deathblade", "completed"),
      row("TFT_Item_Deathblade", "Deathblade", "completed"),
      row("DA_Artifact_Fishbones", "Fishbones", "artifact"),
      row("DA_18_EmblemHunter", "Hunter Emblem", "emblem", "DA_18_Hunter"),
      row("DA_Component_BFSword", "B.F. Sword", "component"),
      row("DA_InfinityEdgeRadiant", "Radiant Infinity Edge", "radiant"),
      row("DA_TacticiansCrown", "Tacticians Crown", "completed"),
      row("DA_18_Cheese", "Cheese", "other"),
    ]);
    expect(pool.map((item) => [item.apiName, item.kind])).toEqual([
      ["DA_Deathblade", "completed"],
      ["DA_TacticiansCrown", "completed"],
      ["DA_18_EmblemHunter", "emblem"],
      ["DA_Artifact_Fishbones", "artifact"],
    ]);
    expect(pool[2]?.grantsTrait).toBe("DA_18_Hunter");
  });

  it("drops Artifactinate and keeps one of two same-named rows, the shorter api name", () => {
    const pool = plannerItemPool([
      row("DA_Artifactinate18", "Artifactinate", "artifact"),
      row("DA_Artifactinate18_Upgrade", "Artifactinate", "artifact"),
      row("DA_18_EmblemFloraFatalisAugment", "Flora Fatalis Emblem", "emblem", "DA_FloraFatalis18"),
      row("DA_18_EmblemFloraFatalis", "Flora Fatalis Emblem", "emblem", "DA_FloraFatalis18"),
    ]);
    expect(pool.map((item) => item.apiName)).toEqual(["DA_18_EmblemFloraFatalis"]);
  });
});

describe("filterChampions", () => {
  const all = Object.values(CATALOG.champions);
  const none = { costs: new Set<number>(), traits: new Set<string>(), query: "" };

  it("lists every champion cheapest first, then by name", () => {
    expect(filterChampions(all, none, CATALOG.traitNames).map((c) => c.name)).toEqual([
      "Ornn",
      "Pebbles",
      "Sivir",
      "Ashe",
      "Lux",
    ]);
  });

  it("filters by cost and by any selected trait, Riftbeasts included", () => {
    expect(filterChampions(all, { ...none, costs: new Set([1]) }, CATALOG.traitNames).map((c) => c.name)).toEqual([
      "Ornn",
      "Pebbles",
    ]);
    const traits = new Set(["DA_Riftbeast18", "DA_18_Hunter"]);
    expect(filterChampions(all, { ...none, traits }, CATALOG.traitNames).map((c) => c.name)).toEqual([
      "Pebbles",
      "Sivir",
      "Ashe",
    ]);
  });

  it("matches every query word against names and trait names, ignoring case and punctuation", () => {
    expect(filterChampions(all, { ...none, query: "HUNT" }, CATALOG.traitNames).map((c) => c.name)).toEqual(["Sivir", "Ashe"]);
    expect(filterChampions(all, { ...none, query: "hunter blossom" }, CATALOG.traitNames).map((c) => c.name)).toEqual(["Ashe"]);
    expect(filterChampions(all, { ...none, query: "peb-bles" }, CATALOG.traitNames).map((c) => c.name)).toEqual(["Pebbles"]);
  });
});

describe("championLabels", () => {
  it("names a unique champion plainly and tells same-named forms apart by their own trait", () => {
    const lux = (apiName: string, element: string) => ({
      apiName,
      name: "Lux",
      cost: 5,
      iconUrl: null,
      traits: [element, "DA_18_Invoker"],
      plannerCode: null,
    });
    const champions = [...Object.values(CATALOG.champions), lux("DA_Lux18_Blossom", "DA_18_Blossom"), lux("DA_Lux18_Hunter", "DA_18_Hunter")];
    const labels = championLabels(champions, CATALOG.traitNames);
    expect(labels.DA_18_Ashe).toBe("Ashe");
    expect(labels.DA_Lux18_Blossom).toBe("Lux · Blossom");
    expect(labels.DA_Lux18_Hunter).toBe("Lux · Hunter");
    // The fixture's own Lux only has the shared trait, so it keeps the bare name.
    expect(labels.DA_Lux18_Wind).toBe("Lux");
  });
});

describe("filterItems and traitOptions", () => {
  const items = Object.values(CATALOG.items);

  it("filters items by kind and by name or granted trait", () => {
    expect(filterItems(items, "emblem", "", CATALOG.traitNames)).toHaveLength(2);
    expect(filterItems(items, "all", "invoker", CATALOG.traitNames).map((i) => i.apiName)).toEqual(["DA_18_EmblemInvoker"]);
    expect(filterItems(items, "completed", "edge", CATALOG.traitNames).map((i) => i.name)).toEqual(["Infinity Edge"]);
  });

  it("offers only traits some champion has, by name", () => {
    expect(traitOptions(Object.values(CATALOG.champions), CATALOG.traitNames).map((o) => o.label)).toEqual([
      "Blossom",
      "Defender",
      "Elderwood",
      "Hunter",
      "Invoker",
      "Riftbeast",
    ]);
  });
});
