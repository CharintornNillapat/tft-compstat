import { describe, expect, it } from "vitest";
import { matchRow } from "./__fixtures__/rows";
import { summarize } from "./summary";

/**
 * Eight games, hand-calculated — the roadmap's "stats match a hand calculation on
 * fixture data" gate. Placements: 1, 3, 2, 8, 4, 6, 1, 7.
 *   total 32 → avg 4.0 | top four: 1,3,2,4,1 = 5/8 = 0.625 | wins 2/8 = 0.25
 *   levels 9,8,8,6,9,7,9,6 = 62 / 8 = 7.75
 */
const rows = [
  matchRow({ placement: 1, level: 9 }),
  matchRow({ placement: 3, level: 8 }),
  matchRow({ placement: 2, level: 8 }),
  matchRow({ placement: 8, level: 6 }),
  matchRow({ placement: 4, level: 9 }),
  matchRow({ placement: 6, level: 7 }),
  matchRow({ placement: 1, level: 9 }),
  matchRow({ placement: 7, level: 6 }),
];

describe("summarize", () => {
  it("matches the hand calculation", () => {
    const summary = summarize(rows);
    expect(summary.games).toBe(8);
    expect(summary.avgPlacement).toBe(4);
    expect(summary.top4Rate).toBe(0.625);
    expect(summary.winRate).toBe(0.25);
    expect(summary.avgLevel).toBe(7.75);
  });

  it("buckets placements 1-8 in order, and the buckets sum to the game count", () => {
    const summary = summarize(rows);
    expect(summary.placementDist).toEqual([2, 1, 1, 1, 0, 1, 1, 1]);
    expect(summary.placementDist.reduce((a, b) => a + b, 0)).toBe(summary.games);
  });

  it("keeps `recent` in the order it was given, which is newest first", () => {
    expect(summarize(rows).recent).toEqual([1, 3, 2, 8, 4, 6, 1, 7]);
  });

  it("returns zeroes rather than NaN for no games", () => {
    expect(summarize([])).toEqual({
      games: 0,
      avgPlacement: 0,
      top4Rate: 0,
      winRate: 0,
      avgLevel: 0,
      placementDist: [0, 0, 0, 0, 0, 0, 0, 0],
      recent: [],
    });
  });

  it("averages only the levels it has, and reports 0 when it has none", () => {
    expect(summarize([matchRow({ placement: 1, level: 9 }), matchRow({ placement: 5, level: null })]).avgLevel).toBe(9);
    expect(summarize([matchRow({ placement: 1, level: null })]).avgLevel).toBe(0);
  });

  it("counts an out-of-range placement in the averages without corrupting the histogram", () => {
    // Defensive: nothing should produce this, but a bad row must not shift every bucket.
    const summary = summarize([matchRow({ placement: 1 }), matchRow({ placement: 99 })]);
    expect(summary.placementDist).toEqual([1, 0, 0, 0, 0, 0, 0, 0]);
    expect(summary.games).toBe(2);
  });

  it("treats a single first place as a clean sweep", () => {
    const summary = summarize([matchRow({ placement: 1 })]);
    expect(summary).toMatchObject({ games: 1, avgPlacement: 1, top4Rate: 1, winRate: 1 });
  });
});
