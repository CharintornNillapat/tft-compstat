import { describe, expect, it } from "vitest";
import type { NameBook } from "@/lib/static/names";
import { compKey } from "@/lib/sync/comp-signature";
import { matchRow } from "./__fixtures__/rows";
import { favoriteComps } from "./comps";

const names: NameBook = {
  champions: { DA_18_Sivir: { name: "Sivir", cost: 4, iconUrl: null } },
  traits: { DA_18_Hunter: { name: "Hunter", iconUrl: null }, DA_Primal18: { name: "Primal", iconUrl: null } },
  items: {},
};

const sivirHunter = (placement: number) =>
  matchRow({
    placement,
    carryUnit: "DA_18_Sivir",
    primaryTraits: ["DA_18_Hunter", "DA_Primal18"],
    compKey: compKey("DA_18_Sivir", ["DA_18_Hunter", "DA_Primal18"]),
  });

describe("favoriteComps", () => {
  it("groups rows sharing a comp key and averages over the group", () => {
    const stats = favoriteComps([sivirHunter(1), sivirHunter(3), sivirHunter(8)], names);
    expect(stats).toHaveLength(1);
    expect(stats[0]).toMatchObject({ games: 3, avgPlacement: 4, top4Rate: 2 / 3 });
  });

  it("labels through signatureLabel, resolving display names", () => {
    expect(favoriteComps([sivirHunter(1)], names)[0]!.label).toBe("Hunter Primal · Sivir");
  });

  it("falls back to api names when the static tables don't know one", () => {
    const stats = favoriteComps([sivirHunter(1)], { champions: {}, traits: {}, items: {} });
    expect(stats[0]!.label).toBe("DA_18_Hunter DA_Primal18 · DA_18_Sivir");
  });

  it("collects carry-less bust-outs under one 'Unknown comp' group rather than dropping them", () => {
    // An 8th-place bust-out has no items, so no carry and no signature at all.
    const stats = favoriteComps([matchRow({ placement: 8 }), matchRow({ placement: 7 })], names);
    expect(stats).toEqual([{ compKey: "|", label: "Unknown comp", games: 2, avgPlacement: 7.5, top4Rate: 0 }]);
  });

  it("sorts by games desc, then average placement, then label", () => {
    const other = matchRow({
      placement: 1,
      carryUnit: "DA_18_Sivir",
      primaryTraits: ["DA_18_Hunter"],
      compKey: compKey("DA_18_Sivir", ["DA_18_Hunter"]),
    });
    const stats = favoriteComps([sivirHunter(4), sivirHunter(5), other], names);
    expect(stats.map((s) => s.games)).toEqual([2, 1]);
  });

  it("honours minGames and limit", () => {
    const rows = [sivirHunter(1), sivirHunter(2), matchRow({ placement: 8 })];
    expect(favoriteComps(rows, names, { minGames: 2 })).toHaveLength(1);
    expect(favoriteComps(rows, names, { limit: 1 })).toHaveLength(1);
  });
});
