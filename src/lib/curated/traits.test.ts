import { describe, expect, it } from "vitest";
import type { TraitBreakpoint, TraitStyle } from "@/lib/static/game";
import { computeActiveTraits, isActive, type TraitInfo, type TraitUnit } from "./traits";

/** "3b 5s 7g" → breakpoints, the notation used when checking boards by hand. */
const bp = (spec: string): TraitBreakpoint[] => {
  const styles: Record<string, TraitStyle> = { b: "bronze", s: "silver", g: "gold", p: "prismatic", u: "unique" };
  return spec.split(" ").map((part) => ({ min: Number(part.slice(0, -1)), style: styles[part.at(-1)!]! }));
};

// Set 18 breakpoints as stored by sync-static (game data 16.18).
const traits = new Map<string, TraitInfo>(
  (
    [
      ["DA_18_Elderwood", "Elderwood", "3b 5s 7g 9g 11p"],
      ["DA_18_Brawler", "Brawler", "2b 4s 6g"],
      ["DA_18_Executioner", "Executioner", "2b 3s 4g"],
      ["DA_18_Inferno", "Inferno", "2b 3s 5g 7g"],
      ["DA_Juggernaut18", "Juggernaut", "2b 4s 6g"],
      ["DA_18_Vanguard", "Vanguard", "2b 4s 6g"],
      ["DA_18_Sprykin", "Sprykin", "3b 5s 7g"],
      ["DA_18_Blossom", "Blossom", "3b 5s 7g 9g 11p"],
      ["DA_18_Coven", "Coven", "3b 4s 5s 7g"],
      ["DA_DravenUniqueTrait18", "Bounty Seeker", "1u"],
      ["DA_18_Maokai_UniqueTrait", "Old Growth", "1u"],
      ["DA_18_Greenfather", "Greenfather", "1u"],
      ["DA_Emerald18", "Emerald Aspect", "1u"],
    ] as const
  ).map(([apiName, name, spec]) => [apiName, { name, iconUrl: null, breakpoints: bp(spec) }]),
);

const CHAMPION_TRAITS: Record<string, string[]> = {
  DA_Draven18: ["DA_DravenUniqueTrait18"],
  DA_18_Maokai: ["DA_18_Maokai_UniqueTrait", "DA_Juggernaut18"],
  DA_18_Ivern: ["DA_18_Greenfather"],
  DA_18_GnarSmall: ["DA_18_Elderwood", "DA_18_Sprykin", "DA_18_Brawler"],
  DA_18_Kennen: ["DA_18_Inferno", "DA_18_Executioner"],
  DA_Taric18: ["DA_Emerald18", "DA_18_Vanguard"],
  DA_18_Ezreal: ["DA_18_Elderwood", "DA_18_Executioner"],
  DA_Amumu18: ["DA_18_Inferno", "DA_Juggernaut18"],
  DA_18_Alistar: ["DA_18_Elderwood", "DA_18_Brawler"],
  DA_18_Sett: ["DA_18_Blossom", "DA_18_Brawler"],
};

const unit = (apiName: string, emblemTraits: string[] = []): TraitUnit => ({
  apiName,
  traits: CHAMPION_TRAITS[apiName]!,
  emblemTraits,
});

/** `count name style` per trait, in display order: easy to compare with a board checked by hand. */
const summary = (units: TraitUnit[]) =>
  computeActiveTraits(units, traits).map((t) => `${t.count} ${t.name} ${t.style ?? "inactive"}`);

const DRAVEN_BOARD = [
  "DA_Draven18",
  "DA_18_Maokai",
  "DA_18_Ivern",
  "DA_18_GnarSmall",
  "DA_18_Kennen",
  "DA_Taric18",
  "DA_18_Ezreal",
  "DA_Amumu18",
  "DA_18_Alistar",
];

describe("computeActiveTraits", () => {
  it("matches the hand-checked Draven fast 9 board", () => {
    expect(summary(DRAVEN_BOARD.map((apiName) => unit(apiName)))).toEqual([
      "3 Elderwood bronze",
      "2 Brawler bronze",
      "2 Executioner bronze",
      "2 Inferno bronze",
      "2 Juggernaut bronze",
      "1 Bounty Seeker unique",
      "1 Emerald Aspect unique",
      "1 Greenfather unique",
      "1 Old Growth unique",
      "1 Sprykin inactive",
      "1 Vanguard inactive",
    ]);
  });

  it("reports the level reached and every breakpoint", () => {
    const [elderwood] = computeActiveTraits(DRAVEN_BOARD.map((apiName) => unit(apiName)), traits);
    expect(elderwood).toEqual({
      apiName: "DA_18_Elderwood",
      name: "Elderwood",
      iconUrl: null,
      count: 3,
      level: 1,
      style: "bronze",
      breakpoints: [3, 5, 7, 9, 11],
    });
    const brawlers = computeActiveTraits(
      ["DA_18_GnarSmall", "DA_18_Alistar", "DA_18_Sett"].map((apiName) => unit(apiName)),
      traits,
    ).find((t) => t.name === "Brawler");
    expect(brawlers).toMatchObject({ count: 3, level: 1, style: "bronze" });
  });

  it("counts an emblem's trait for its holder", () => {
    const board = DRAVEN_BOARD.map((apiName) => unit(apiName, apiName === "DA_18_Maokai" ? ["DA_18_Vanguard"] : []));
    const vanguard = computeActiveTraits(board, traits).find((t) => t.name === "Vanguard");
    expect(vanguard).toMatchObject({ count: 2, level: 1, style: "bronze" });
    expect(isActive(vanguard!)).toBe(true);
  });

  it("ignores an emblem for a trait the unit already has", () => {
    const traitsWith = (emblem: string[]) =>
      computeActiveTraits([unit("DA_18_GnarSmall", emblem), unit("DA_18_Alistar")], traits).find(
        (t) => t.name === "Brawler",
      )?.count;
    expect(traitsWith(["DA_18_Brawler"])).toBe(2);
    expect(traitsWith([])).toBe(2);
  });

  it("counts a champion once even when it's fielded twice", () => {
    const board = [unit("DA_18_Alistar"), unit("DA_18_Alistar"), unit("DA_18_Ezreal"), unit("DA_18_GnarSmall")];
    expect(computeActiveTraits(board, traits).find((t) => t.name === "Elderwood")?.count).toBe(3);
  });

  it("uses the highest style reached, including repeated styles", () => {
    const coven = (count: number) =>
      computeActiveTraits(
        Array.from({ length: count }, (_, i) => ({ apiName: `unit${i}`, traits: ["DA_18_Coven"] })),
        traits,
      )[0]!;
    expect([2, 3, 4, 5, 6, 7].map((n) => `${coven(n).level}:${coven(n).style}`)).toEqual([
      "0:null",
      "1:bronze",
      "2:silver",
      "3:silver",
      "3:silver",
      "4:gold",
    ]);
  });

  it("skips traits without static data and puts active traits before inactive ones", () => {
    const result = computeActiveTraits(
      [
        { apiName: "a", traits: ["DA_18_Sprykin", "DA_Unknown"] },
        { apiName: "b", traits: ["DA_18_Sprykin", "DA_18_Brawler"] },
        { apiName: "c", traits: ["DA_18_Brawler"] },
      ],
      traits,
    );
    expect(result.map((t) => `${t.count} ${t.name} ${t.level}`)).toEqual(["2 Brawler 1", "2 Sprykin 0"]);
  });

  it("returns nothing for an empty board", () => {
    expect(computeActiveTraits([], traits)).toEqual([]);
  });
});
