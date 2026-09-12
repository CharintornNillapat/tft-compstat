import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { TraitBreakpoint } from "@/lib/static/game";
import { matchSchema } from "@/lib/riot/schemas";
import { buildSignature, carryUnit, compKey, primaryTraits, signatureLabel } from "./comp-signature";
import { deriveMatch, derivePlayerMatch, traitStyle, type StaticLookup } from "./derive";
import { patchForMatch, unknownPatch } from "./patches";

/**
 * The fixture is a real Set 18 game captured by `pnpm riot:setup --fixture`
 * (SG2_173695822, 2026-09-12), with every puuid replaced — `matches.raw` holds other
 * players' lobby data, which is why anon can't read that table (§4.6).
 */
const raw: unknown = JSON.parse(readFileSync("src/lib/sync/__fixtures__/match.json", "utf8"));
const dto = matchSchema.parse(raw);
const ME = "PUUID_ME";

/** The breakpoints the real static tables hold for the traits in this match. */
const BREAKPOINTS: Record<string, TraitBreakpoint[]> = {
  DA_18_Battlemage: [{ min: 1, style: "unique" }],
  DA_18_Caustic: [{ min: 1, style: "unique" }],
  DA_18_Blackthorn: [{ min: 2, style: "bronze" }, { min: 4, style: "silver" }, { min: 6, style: "gold" }],
  DA_18_Brawler: [{ min: 2, style: "bronze" }, { min: 4, style: "silver" }, { min: 6, style: "gold" }],
  DA_18_Adaptor: [{ min: 2, style: "bronze" }, { min: 3, style: "silver" }, { min: 4, style: "gold" }],
  DA_18_Hunter: [
    { min: 2, style: "bronze" }, { min: 3, style: "silver" }, { min: 4, style: "silver" }, { min: 5, style: "gold" },
  ],
  DA_18_Invoker: [
    { min: 2, style: "bronze" }, { min: 3, style: "silver" }, { min: 4, style: "silver" }, { min: 5, style: "gold" },
  ],
  DA_Primal18: [{ min: 2, style: "bronze" }, { min: 4, style: "gold" }],
  DA_Riftbeast18: [
    { min: 3, style: "bronze" }, { min: 5, style: "silver" }, { min: 7, style: "gold" }, { min: 10, style: "gold" },
  ],
  DA_18_Slayer: [{ min: 2, style: "bronze" }, { min: 4, style: "silver" }, { min: 6, style: "gold" }],
  DA_18_Vanguard: [{ min: 2, style: "bronze" }, { min: 4, style: "silver" }, { min: 6, style: "gold" }],
};

/** Real costs, including the Riftbeasts that only exist since the §11 pre-requisite. */
const COSTS: Record<string, number> = {
  DA_18_RekSai: 3, DA_Nidalee18_AP: 2, DA_Sentinel18: 4, DA_Krug18: 3,
  DA_18_Sivir: 4, DA_KogMaw18_AD: 1, DA_18_Malphite: 2, DA_Cinderling18: 1,
};

const lookup: StaticLookup = {
  championCost: (apiName) => COSTS[apiName],
  traitBreakpoints: (apiName) => BREAKPOINTS[apiName],
};

describe("the captured match", () => {
  it("carries no real account identifiers", () => {
    const text = JSON.stringify(raw);
    expect(text).toContain(ME);
    // Riot puuids are 78 characters; none should have survived anonymization.
    expect(text.match(/"[\w-]{70,}"/g)).toBeNull();
  });

  it("is the Set 18 ranked game the §11 checks were run against", () => {
    expect(dto.metadata.match_id).toBe("SG2_173695822");
    expect(dto.info.tft_set_number).toBe(18);
    expect(dto.info.queue_id).toBe(1100);
    // The Unreal move emptied this field, which is why patch comes from the date (§6.4).
    expect(dto.info.game_version).toBe("TFT Unreal Version ?.?.?.?");
  });
});

describe("deriveMatch", () => {
  const row = deriveMatch(dto, raw);

  it("labels the patch from the game's date, not from game_version", () => {
    // Played 2026-09-06, after 18.1 (Aug 26) and before 18.2 (Sep 10).
    expect(row.game_datetime).toBe("2026-09-06T15:32:52.070Z");
    expect(row.patch).toBe("18.1");
    expect(row.set_number).toBe(18);
  });

  it("stores the untouched response as raw", () => {
    expect(row.raw).toBe(raw);
  });
});

describe("patchForMatch", () => {
  const at = (iso: string) => Date.parse(iso);

  it("picks the latest patch released at or before the game", () => {
    expect(patchForMatch(18, at("2026-09-12T00:00:00Z"))).toBe("18.2");
    expect(patchForMatch(18, at("2026-09-09T23:59:59Z"))).toBe("18.1");
    expect(patchForMatch(18, at("2026-08-26T00:00:00Z"))).toBe("18.1");
    expect(patchForMatch(17, at("2026-09-12T00:00:00Z"))).toBe("17.1");
  });

  it("is visibly unknown rather than wrong for a set or date it has no row for", () => {
    expect(patchForMatch(18, at("2026-01-01T00:00:00Z"))).toBe("18.?");
    expect(patchForMatch(99, at("2026-09-12T00:00:00Z"))).toBe(unknownPatch(99));
  });
});

describe("traitStyle", () => {
  it("reads the style from tier_current, not from Riot's code", () => {
    // Hunter at 3 units reports style 2 / tier_current 2 → our second breakpoint.
    expect(traitStyle({ style: 2, tier_current: 2, tier_total: 4 }, BREAKPOINTS.DA_18_Hunter)).toBe("silver");
    expect(traitStyle({ style: 1, tier_current: 1, tier_total: 3 }, BREAKPOINTS.DA_18_Brawler)).toBe("bronze");
  });

  it("calls a one-breakpoint trait unique even though Riot reports style 3", () => {
    // Riot uses 3 for gold too, which is exactly why its code isn't trusted (§6.1).
    expect(traitStyle({ style: 3, tier_current: 1, tier_total: 1 }, BREAKPOINTS.DA_18_Battlemage)).toBe("unique");
  });

  it("treats tier_current 0 as inactive", () => {
    expect(traitStyle({ style: 0, tier_current: 0, tier_total: 3 }, BREAKPOINTS.DA_18_Slayer)).toBeUndefined();
  });

  it("falls back to Riot's code for a trait missing from the static tables", () => {
    expect(traitStyle({ style: 4, tier_current: 3, tier_total: 4 }, undefined)).toBe("prismatic");
    expect(traitStyle({ style: 3, tier_current: 1, tier_total: 1 }, undefined)).toBe("unique");
    // Out-of-range tier against known breakpoints also falls back rather than crashing.
    expect(traitStyle({ style: 2, tier_current: 9, tier_total: 3 }, BREAKPOINTS.DA_18_Brawler)).toBe("silver");
  });
});

describe("derivePlayerMatch on the real match", () => {
  const row = derivePlayerMatch(dto, ME, lookup);

  it("normalizes the participant row", () => {
    expect(row).toMatchObject({
      match_id: "SG2_173695822",
      puuid: ME,
      placement: 7,
      set_number: 18,
      queue_id: 1100,
      derived_version: 1,
    });
    expect(row.level).toBeGreaterThan(0);
  });

  it("keeps only active traits, styled from our breakpoints", () => {
    const traits = row.traits as unknown as { name: string; style: string; num_units: number }[];
    const byName = Object.fromEntries(traits.map((t) => [t.name, t.style]));

    expect(byName).toEqual({
      DA_18_Battlemage: "unique",
      DA_18_Caustic: "unique",
      DA_18_Hunter: "silver",
      DA_18_Blackthorn: "bronze",
      DA_18_Brawler: "bronze",
      DA_18_Adaptor: "bronze",
      DA_18_Invoker: "bronze",
      DA_Primal18: "bronze",
      DA_Riftbeast18: "bronze",
    });
    // Slayer and Vanguard were on the board at 1 unit and never activated.
    expect(byName.DA_18_Slayer).toBeUndefined();
    expect(byName.DA_18_Vanguard).toBeUndefined();
  });

  it("records all eight units, including the Riftbeasts the pre-requisite added", () => {
    const units = row.units as unknown as { character_id: string; star: number; items: string[] }[];
    expect(units).toHaveLength(8);
    expect(units.map((u) => u.character_id)).toContain("DA_Sentinel18");
    expect(units.map((u) => u.character_id)).toContain("DA_Krug18");
    // Every unit costed: the whole point of storing non-shop units (§11).
    expect(units.every((u) => COSTS[u.character_id] !== undefined)).toBe(true);
    expect(units.reduce((n, u) => n + u.items.length, 0)).toBe(13);
  });

  it("picks a carry and a comp key from the board", () => {
    // Four units held 3 items; Sentinel and Sivir tie on stars, then on cost (both 4),
    // so the name decides.
    expect(row.carry_unit).toBe("DA_18_Sivir");
    // Uniques are dropped, so silver Hunter leads, then the widest bronze (Riftbeast, 3).
    expect(row.primary_traits).toEqual(["DA_18_Hunter", "DA_Riftbeast18"]);
    expect(row.comp_key).toBe("DA_18_Sivir|DA_18_Hunter+DA_Riftbeast18");
    expect(row.comp_key).toBe(compKey(row.carry_unit ?? undefined, row.primary_traits as string[]));
  });

  it("throws when the tracked player isn't in the lobby", () => {
    expect(() => derivePlayerMatch(dto, "PUUID_NOBODY", lookup)).toThrowError(/no participant/);
  });
});

describe("comp signature v1", () => {
  const trait = (apiName: string, numUnits: number, style: "bronze" | "silver" | "gold" | "prismatic" | "unique", tierTotal = 3) =>
    ({ apiName, numUnits, style, tierTotal }) as const;
  const unit = (apiName: string, itemCount: number, star = 2, cost = 3) =>
    ({ apiName, itemCount, star, cost }) as const;

  it("ranks traits by style, then unit count, then name", () => {
    expect(
      primaryTraits([
        trait("Bronze2", 2, "bronze"),
        trait("Gold", 6, "gold"),
        trait("Silver", 4, "silver"),
        trait("Bronze9", 9, "bronze"),
      ]),
    ).toEqual(["Gold", "Silver"]);
  });

  it("excludes unique traits, which say nothing about a comp's shape", () => {
    expect(primaryTraits([trait("Solo", 1, "unique", 1), trait("Real", 2, "bronze")])).toEqual(["Real"]);
  });

  it("picks the carry by items, then stars, then cost", () => {
    expect(carryUnit([unit("A", 1), unit("B", 3), unit("C", 2)])).toBe("B");
    expect(carryUnit([unit("A", 3, 2, 5), unit("B", 3, 3, 1)])).toBe("B"); // stars beat cost
    expect(carryUnit([unit("A", 3, 2, 1), unit("B", 3, 2, 5)])).toBe("B"); // then cost
    expect(carryUnit([unit("A", 0), unit("B", 0)])).toBeUndefined();
  });

  it("produces a stable key whatever order the traits arrive in", () => {
    const a = buildSignature([unit("Carry", 3)], [trait("Zed", 4, "silver"), trait("Ahri", 6, "gold")]);
    const b = buildSignature([unit("Carry", 3)], [trait("Ahri", 6, "gold"), trait("Zed", 4, "silver")]);
    expect(a.compKey).toBe(b.compKey);
    expect(a.compKey).toBe("Carry|Ahri+Zed");
  });

  it("keeps an empty carry and empty traits distinguishable", () => {
    expect(compKey(undefined, ["A"])).toBe("|A");
    expect(compKey("Carry", [])).toBe("Carry|");
  });

  it("labels a signature from display names, falling back to api names", () => {
    const names = {
      trait: (n: string) => ({ DA_18_Hunter: "Hunter" })[n],
      champion: (n: string) => ({ DA_18_Sivir: "Sivir" })[n],
    };
    expect(signatureLabel({ carryUnit: "DA_18_Sivir", primaryTraits: ["DA_18_Hunter"] }, names)).toBe("Hunter · Sivir");
    expect(signatureLabel({ carryUnit: "DA_Unknown", primaryTraits: [] }, names)).toBe("DA_Unknown");
    expect(signatureLabel({ carryUnit: undefined, primaryTraits: [] }, names)).toBe("Unknown comp");
  });
});
