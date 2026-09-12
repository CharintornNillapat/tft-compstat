import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { TIER_RANKS, type TierRank } from "@/lib/static/game";
import {
  assignTiers,
  averagePlacement,
  buildTierListYaml,
  describeBandEdges,
  describeBands,
  diffTiers,
  groupByTier,
  rankRows,
  readExistingTierList,
  tierCuts,
  tierListFingerprint,
  tierListSlug,
  totalGames,
  type MetaRow,
  type RankedEntry,
} from "./meta-sync";
import { tierListFileSchema } from "./schemas";

/** A histogram whose mean placement is exactly `avg`, over `games` games. */
function places(avg: number, games = 10_000): number[] {
  // Put the mass on 1st and 8th: mean = 1 + 7 * (share on 8th).
  const eighth = Math.round(((avg - 1) / 7) * games);
  const row = Array.from({ length: 8 }, () => 0);
  row[0] = games - eighth;
  row[7] = eighth;
  return row;
}

describe("averagePlacement", () => {
  it("weights each bucket by its finishing position", () => {
    expect(averagePlacement([1, 0, 0, 0, 0, 0, 0, 0])).toBe(1);
    expect(averagePlacement([0, 0, 0, 0, 0, 0, 0, 1])).toBe(8);
    expect(averagePlacement([1, 1, 1, 1, 1, 1, 1, 1])).toBe(4.5);
    expect(averagePlacement([3, 0, 0, 0, 0, 0, 0, 1])).toBe(2.75);
  });

  it("is undefined rather than NaN when nothing was played", () => {
    expect(averagePlacement([0, 0, 0, 0, 0, 0, 0, 0])).toBeUndefined();
    expect(totalGames([0, 0, 0, 0, 0, 0, 0, 0])).toBe(0);
  });
});

/** How many rows landed in each tier, in TIER_RANKS order. */
const spread = (tiers: readonly TierRank[]) => TIER_RANKS.map((tier) => tiers.filter((row) => row === tier).length);

/** `count` distinct averages, ascending, a hundredth apart. */
const averages = (count: number) => Array.from({ length: count }, (_, index) => 4 + index / 100);

describe("tierCuts", () => {
  it("cuts a list into 15 / 30 / 35 / 20 of its length", () => {
    expect(tierCuts(20)).toEqual([3, 9, 16, 20]); // S 3 · A 6 · B 7 · C 4
    expect(tierCuts(55)).toEqual([8, 25, 44, 55]); // S 8 · A 17 · B 19 · C 11
  });

  it("stays in order and ends exactly at the count, at every size", () => {
    // Accumulating the shares before rounding is what guarantees this; rounding each
    // band on its own lets the error compound and the last cut miss the end.
    for (let count = 0; count <= 200; count++) {
      const cuts = tierCuts(count);
      expect(cuts).toEqual([...cuts].sort((a, b) => a - b));
      expect(cuts[cuts.length - 1]).toBe(count);
    }
  });
});

describe("assignTiers", () => {
  it("bands by rank, so the absolute average does not decide the shape", () => {
    // Twenty rows inside a fifth of a placement still fill all four tiers, and the
    // same twenty shifted wholesale by a full placement land identically.
    expect(spread(assignTiers(averages(20)))).toEqual([3, 6, 7, 4]);
    expect(spread(assignTiers(averages(20).map((avg) => avg + 1)))).toEqual([3, 6, 7, 4]);
  });

  it("gives every row exactly one tier, at every size", () => {
    for (let count = 1; count <= 60; count++) {
      const tiers = assignTiers(averages(count));
      expect(tiers).toHaveLength(count);
      expect(tiers.every((tier) => TIER_RANKS.includes(tier))).toBe(true);
    }
  });

  it("extends a band over a tie rather than splitting it", () => {
    // Rows 2 and 3 straddle the S cut of a 20-row list, so both belong in S: the
    // alternative is the api-name tiebreak deciding a rating.
    const tied = averages(20);
    tied[3] = tied[2]!;
    const tiers = assignTiers(tied);
    expect(tiers.slice(0, 5)).toEqual(["S", "S", "S", "S", "A"]);
    expect(spread(tiers)).toEqual([4, 5, 7, 4]);
  });
});

describe("describeBands", () => {
  it("reads as shares of the list, for the generated header", () => {
    expect(describeBands()).toBe("S top 15%, A next 30%, B next 35%, C the rest");
  });
});

describe("describeBandEdges", () => {
  it("names each tier's size and worst average, and skips the empty ones", () => {
    const entries: RankedEntry[] = [
      { apiName: "a", tier: "S", avgPlace: 3.9, games: 1 },
      { apiName: "b", tier: "S", avgPlace: 4.114, games: 1 },
      { apiName: "c", tier: "C", avgPlace: 4.7, games: 1 },
    ];
    expect(describeBandEdges(entries)).toBe("S 2 to 4.11, C 1 to 4.70");
  });
});

describe("rankRows", () => {
  const rows: MetaRow[] = [
    { apiName: "DA_18_Slow", places: places(4.6) },
    { apiName: "DA_18_Best", places: places(3.9) },
    { apiName: "DA_18_Mid", places: places(4.2) },
    { apiName: "DA_18_Thin", places: places(4.0, 100) },
  ];

  it("sorts best average placement first", () => {
    const { entries } = rankRows(rows, 500);
    expect(entries.map((entry) => entry.apiName)).toEqual(["DA_18_Best", "DA_18_Mid", "DA_18_Slow"]);
  });

  it("bands the rated rows even when they are bunched together", () => {
    // Twenty units inside a fifth of a placement: absolute cutoffs would drop the lot
    // into one tier, which is what made the champion list an A tier of 2 in 55.
    const bunched: MetaRow[] = Array.from({ length: 20 }, (_, index) => ({
      apiName: `DA_18_U${String(index).padStart(2, "0")}`,
      places: places(4.4 + index / 100),
    }));
    const { entries } = rankRows(bunched, 500);
    expect(spread(entries.map((entry) => entry.tier))).toEqual([3, 6, 7, 4]);
    expect(entries[0]).toMatchObject({ apiName: "DA_18_U00", tier: "S" });
    expect(entries[entries.length - 1]).toMatchObject({ apiName: "DA_18_U19", tier: "C" });
  });

  it("ranks only what it rates: a thin row does not take up a band's place", () => {
    const bunched: MetaRow[] = Array.from({ length: 20 }, (_, index) => ({
      apiName: `DA_18_U${String(index).padStart(2, "0")}`,
      places: places(4.4 + index / 100, index === 0 ? 100 : 10_000),
    }));
    const { entries, thin } = rankRows(bunched, 500);
    expect(thin).toHaveLength(1);
    expect(entries).toHaveLength(19);
    // 19 rated rows, not 20: the bands are cut from what was actually rated.
    expect(spread(entries.map((entry) => entry.tier))).toEqual([3, 6, 6, 4]);
  });

  it("drops rows below the sample floor instead of rating them", () => {
    const { entries, thin } = rankRows(rows, 500);
    expect(entries.some((entry) => entry.apiName === "DA_18_Thin")).toBe(false);
    expect(thin).toEqual([{ apiName: "DA_18_Thin", games: 100 }]);
  });

  it("breaks ties on api name, so the same feed writes the same file", () => {
    const tied: MetaRow[] = [
      { apiName: "DA_18_Zed", places: places(4.0) },
      { apiName: "DA_18_Ahri", places: places(4.0) },
    ];
    expect(rankRows(tied, 0).entries.map((entry) => entry.apiName)).toEqual(["DA_18_Ahri", "DA_18_Zed"]);
    expect(rankRows([...tied].reverse(), 0).entries.map((entry) => entry.apiName)).toEqual([
      "DA_18_Ahri",
      "DA_18_Zed",
    ]);
  });
});

describe("groupByTier", () => {
  const entries: RankedEntry[] = [
    { apiName: "A1", tier: "S", avgPlace: 3.9, games: 10 },
    { apiName: "A2", tier: "S", avgPlace: 4.0, games: 10 },
    { apiName: "B1", tier: "B", avgPlace: 4.4, games: 10 },
  ];

  it("keeps the best-first order inside each tier", () => {
    expect(groupByTier(entries).S).toEqual(["A1", "A2"]);
  });

  it("leaves empty tiers out rather than writing an empty row", () => {
    expect(Object.keys(groupByTier(entries))).toEqual(["S", "B"]);
  });
});

describe("diffTiers", () => {
  it("reports additions, removals and moves", () => {
    const changes = diffTiers({ S: ["stay", "drop"], B: ["rise"] }, { S: ["stay", "rise"], C: ["new"] });
    expect(changes).toEqual([
      { change: "moved", apiName: "rise", from: "B", to: "S" },
      { change: "added", apiName: "new", to: "C" },
      { change: "removed", apiName: "drop", from: "S" },
    ]);
  });

  it("reports nothing when the lists match", () => {
    expect(diffTiers({ S: ["a"], A: ["b"] }, { S: ["a"], A: ["b"] })).toEqual([]);
  });
});

describe("readExistingTierList", () => {
  it("reads back the notes and current flag a sync must carry over", () => {
    const existing = readExistingTierList(
      ['slug: champions-18.2', 'current: false', 'tiers:', '  S: [DA_18_Ashe]', 'notes:', '  DA_18_Ashe: keep me'].join("\n"),
    );
    expect(existing.notes).toEqual({ DA_18_Ashe: "keep me" });
    expect(existing.current).toBe(false);
    expect(existing.tiers.S).toEqual(["DA_18_Ashe"]);
  });

  it("treats an unreadable file as no previous file", () => {
    expect(readExistingTierList("tiers: [unclosed").notes).toEqual({});
    expect(readExistingTierList("").current).toBeUndefined();
  });
});

describe("tierListFingerprint", () => {
  const base = { patch: "18.2", current: true, tiers: { S: ["a", "b"], B: ["c"] }, notes: { a: "note" } };

  it("ignores the header, so a bigger sample alone is not a change", () => {
    expect(tierListFingerprint(base)).toBe(tierListFingerprint({ ...base }));
  });

  it("sees order within a tier, which is the display order", () => {
    expect(tierListFingerprint({ ...base, tiers: { S: ["b", "a"], B: ["c"] } })).not.toBe(tierListFingerprint(base));
  });

  it("sees a move between tiers, a new patch and a changed note", () => {
    expect(tierListFingerprint({ ...base, tiers: { S: ["a"], B: ["c", "b"] } })).not.toBe(tierListFingerprint(base));
    expect(tierListFingerprint({ ...base, patch: "18.3" })).not.toBe(tierListFingerprint(base));
    expect(tierListFingerprint({ ...base, notes: { a: "edited" } })).not.toBe(tierListFingerprint(base));
  });

  it("ignores a note whose entry is not listed, since the file drops it anyway", () => {
    expect(tierListFingerprint({ ...base, notes: { a: "note", gone: "dropped" } })).toBe(tierListFingerprint(base));
  });
});

describe("buildTierListYaml", () => {
  const entries: RankedEntry[] = [
    { apiName: "DA_18_Ashe", tier: "S", avgPlace: 3.85, games: 1000 },
    { apiName: "DA_18_Sett", tier: "B", avgPlace: 4.4, games: 1000 },
  ];
  const source = {
    kind: "champion" as const,
    patch: "18.10",
    current: true,
    entries,
    notes: { DA_18_Ashe: "still the best carry", DA_18_Gone: "left the list" },
    summary: "MetaTFT averages.",
    provenance: ["Source: test."],
  };
  const text = buildTierListYaml(source);

  it("writes a file the seed's own schema accepts", () => {
    // The header is comments, so the schema sees only the document below it.
    expect(tierListFileSchema.safeParse(parse(text)).success).toBe(true);
  });

  it("quotes the patch, so 18.10 does not read back as the number 18.1", () => {
    expect(text).toContain('patch: "18.10"');
  });

  it("marks the file as generated", () => {
    expect(text.startsWith("# GENERATED by `pnpm sync:meta`")).toBe(true);
  });

  it("keeps notes for listed entries and drops notes for entries that left", () => {
    expect(text).toContain("DA_18_Ashe: still the best carry");
    expect(text).not.toContain("DA_18_Gone");
  });

  it("writes one entry per line, so a tier change is a one-line diff", () => {
    expect(text).toContain("  S:\n    - DA_18_Ashe\n");
  });

  it("is byte-identical for identical input", () => {
    expect(buildTierListYaml(source)).toBe(text);
  });
});

describe("tierListSlug", () => {
  it("names a list after its kind and patch", () => {
    expect(tierListSlug("champion", "18.2")).toBe("champions-18.2");
    expect(tierListSlug("item", "18.2")).toBe("items-18.2");
  });
});
