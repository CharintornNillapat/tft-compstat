import { describe, expect, it } from "vitest";
import { QUEUE_IDS } from "@/lib/static/game";
import { matchRow } from "./__fixtures__/rows";
import { selectMatches } from "./filter";
import { DEFAULT_FILTER, type StatsFilter } from "./types";

const at = (day: number, over: Partial<Parameters<typeof matchRow>[0]> = {}) =>
  matchRow({ placement: 1, matchId: `M${day}`, playedAt: `2026-09-${String(day).padStart(2, "0")}T00:00:00.000Z`, ...over });

const ids = (rows: ReturnType<typeof at>[], filter: Partial<StatsFilter>, currentSet: number | null = 18) =>
  selectMatches(rows, { ...DEFAULT_FILTER, ...filter }, { currentSet }).map((row) => row.matchId);

describe("selectMatches", () => {
  it("sorts newest first regardless of input order", () => {
    expect(ids([at(3), at(9), at(5)], {})).toEqual(["M9", "M5", "M3"]);
  });

  it("applies the predicates before lastN, so a filtered lastN yields *up to* that many", () => {
    // 20 games alternating queue: 10 ranked (even days) and 10 normal. "last 10,
    // ranked" must mean ten ranked games, not the ranked half of the last ten.
    const rows = Array.from({ length: 20 }, (_, i) =>
      at(i + 1, i % 2 === 0 ? { queueId: QUEUE_IDS.normal } : {}),
    );
    const ranked = ids(rows, { lastN: 10, queues: "ranked" });
    expect(ranked).toHaveLength(10);
    expect(ranked.slice(0, 3)).toEqual(["M20", "M18", "M16"]);
    expect(ranked.at(-1)).toBe("M2");
  });

  it("drops every non-ranked queue when asked for ranked only", () => {
    const rows = [
      at(1), at(2, { queueId: QUEUE_IDS.normal }), at(3, { queueId: QUEUE_IDS.hyperRoll }),
      at(4, { queueId: QUEUE_IDS.doubleUp }),
    ];
    expect(ids(rows, { queues: "ranked" })).toEqual(["M1"]);
    expect(ids(rows, { queues: "all" })).toEqual(["M4", "M3", "M2", "M1"]);
  });

  it("keeps only the active set, and ignores the filter when no set is active", () => {
    const rows = [at(1), at(2, { setNumber: 17 })];
    expect(ids(rows, { currentSetOnly: true }, 18)).toEqual(["M1"]);
    expect(ids(rows, { currentSetOnly: false }, 18)).toEqual(["M2", "M1"]);
    // `currentSet: null` must not silently hide everything.
    expect(ids(rows, { currentSetOnly: true }, null)).toEqual(["M2", "M1"]);
  });

  it("returns everything it has when there are fewer rows than lastN", () => {
    expect(ids([at(1), at(2)], { lastN: 50 })).toEqual(["M2", "M1"]);
    expect(ids([], { lastN: 10 })).toEqual([]);
  });

  it("breaks timestamp ties on match id, so the order never flickers between renders", () => {
    const same = "2026-09-12T00:00:00.000Z";
    const rows = [matchRow({ placement: 1, matchId: "A", playedAt: same }), matchRow({ placement: 2, matchId: "B", playedAt: same })];
    expect(ids(rows, {})).toEqual(["B", "A"]);
  });

  it("does not mutate the rows it was given", () => {
    const rows = [at(1), at(9), at(5)];
    selectMatches(rows, DEFAULT_FILTER, { currentSet: 18 });
    expect(rows.map((row) => row.matchId)).toEqual(["M1", "M9", "M5"]);
  });
});
