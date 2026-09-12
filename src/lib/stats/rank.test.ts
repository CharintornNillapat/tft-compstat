import { describe, expect, it } from "vitest";
import { formatLp, formatRank, lpDelta, rankRecord, type RankSnapshot } from "./rank";

const snap = (over: Partial<RankSnapshot> = {}): RankSnapshot => ({
  tier: "GOLD",
  division: "II",
  lp: 75,
  wins: 30,
  losses: 20,
  capturedAt: "2026-09-12T00:00:00.000Z",
  ...over,
});

describe("formatRank", () => {
  it("title-cases Riot's uppercase tier and keeps the division", () => {
    expect(formatRank(snap())).toBe("Gold II");
    expect(formatRank(snap({ tier: "PLATINUM", division: "IV" }))).toBe("Platinum IV");
  });

  it("drops the division for the apex tiers, which are a single ladder", () => {
    expect(formatRank(snap({ tier: "MASTER", division: "I" }))).toBe("Master");
    expect(formatRank(snap({ tier: "CHALLENGER", division: "I" }))).toBe("Challenger");
  });

  it("says Unranked rather than rendering a blank badge", () => {
    expect(formatRank(null)).toBe("Unranked");
    expect(formatRank(snap({ tier: null }))).toBe("Unranked");
  });

  it("survives a missing division", () => {
    expect(formatRank(snap({ division: null }))).toBe("Gold");
  });
});

describe("formatLp", () => {
  it("formats LP, and returns null when there is none to show", () => {
    expect(formatLp(snap())).toBe("75 LP");
    expect(formatLp(snap({ lp: 0 }))).toBe("0 LP");
    expect(formatLp(snap({ lp: null }))).toBeNull();
    expect(formatLp(null)).toBeNull();
  });
});

describe("lpDelta", () => {
  it("subtracts within the same division", () => {
    expect(lpDelta(snap({ lp: 75 }), snap({ lp: 60 }))).toBe(15);
    expect(lpDelta(snap({ lp: 60 }), snap({ lp: 75 }))).toBe(-15);
  });

  it("refuses to compare across a promotion, where the raw difference is nonsense", () => {
    // Gold II 75 LP → Gold I 8 LP is a promotion, not a 67 LP loss.
    expect(lpDelta(snap({ division: "I", lp: 8 }), snap({ division: "II", lp: 75 }))).toBeNull();
    expect(lpDelta(snap({ tier: "PLATINUM", division: "IV", lp: 12 }), snap({ lp: 98 }))).toBeNull();
  });

  it("returns null when either side is missing", () => {
    expect(lpDelta(snap(), null)).toBeNull();
    expect(lpDelta(null, snap())).toBeNull();
    expect(lpDelta(snap({ lp: null }), snap())).toBeNull();
  });
});

describe("rankRecord", () => {
  it("reports the win rate over games played", () => {
    expect(rankRecord(snap())).toEqual({ wins: 30, losses: 20, winRate: 0.6 });
  });

  it("handles a fresh account with no games and no record at all", () => {
    expect(rankRecord(snap({ wins: 0, losses: 0 }))).toEqual({ wins: 0, losses: 0, winRate: 0 });
    expect(rankRecord(snap({ wins: null }))).toBeNull();
    expect(rankRecord(null)).toBeNull();
  });
});
