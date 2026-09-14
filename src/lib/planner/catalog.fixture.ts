import type { TraitInfo } from "@/lib/curated/traits";
import type { PlannerCatalog, PlannerChampion, PlannerItem } from "./board";

/** A trimmed Set 18 catalog shared by the planner tests. */

const champion = (
  apiName: string,
  name: string,
  cost: number,
  traits: string[],
  plannerCode: number | null,
): PlannerChampion => ({ apiName, name, cost, iconUrl: null, traits, plannerCode });

const item = (
  apiName: string,
  name: string,
  kind: PlannerItem["kind"],
  grantsTrait: string | null = null,
): PlannerItem => ({ apiName, name, iconUrl: null, kind, grantsTrait });

const champions = [
  champion("DA_18_Ashe", "Ashe", 5, ["DA_18_Hunter", "DA_18_Blossom"], 1008),
  champion("DA_18_Sivir", "Sivir", 4, ["DA_18_Hunter"], 1068),
  champion("DA_18_Sentry", "Pebbles", 1, ["DA_Riftbeast18", "DA_18_Invoker"], 1065),
  champion("DA_18_Ornn", "Ornn", 1, ["DA_18_Elderwood", "DA_18_Defender"], 1055),
  champion("DA_Lux18_Wind", "Lux", 5, ["DA_18_Invoker"], null),
];

const items = [
  item("DA_InfinityEdge", "Infinity Edge", "completed"),
  item("DA_Deathblade", "Deathblade", "completed"),
  item("DA_18_EmblemHunter", "Hunter Emblem", "emblem", "DA_18_Hunter"),
  item("DA_18_EmblemInvoker", "Invoker Emblem", "emblem", "DA_18_Invoker"),
  item("DA_Artifact_Fishbones", "Fishbones", "artifact"),
];

export const CATALOG: PlannerCatalog = {
  champions: Object.fromEntries(champions.map((c) => [c.apiName, c])),
  items: Object.fromEntries(items.map((i) => [i.apiName, i])),
  traitNames: {
    DA_18_Hunter: "Hunter",
    DA_18_Blossom: "Blossom",
    DA_Riftbeast18: "Riftbeast",
    DA_18_Invoker: "Invoker",
    DA_18_Elderwood: "Elderwood",
    DA_18_Defender: "Defender",
  },
};

export const TRAITS: ReadonlyMap<string, TraitInfo> = new Map([
  ["DA_18_Hunter", { name: "Hunter", iconUrl: null, breakpoints: [{ min: 2, style: "bronze" }, { min: 3, style: "silver" }] }],
  ["DA_18_Invoker", { name: "Invoker", iconUrl: null, breakpoints: [{ min: 2, style: "bronze" }] }],
  ["DA_18_Blossom", { name: "Blossom", iconUrl: null, breakpoints: [{ min: 1, style: "unique" }] }],
]);
