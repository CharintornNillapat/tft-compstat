import { describe, expect, it } from "vitest";
import { sortComps, type SortableComp } from "./comp-sort";

const sampleComps: SortableComp[] = [
  { name: "Ashe Fast 9", tier: "S", sortOrder: 2, avgPlace: null, top4Rate: null, pickRate: null },
  { name: "Draven Fast 9", tier: "S", sortOrder: 1, avgPlace: 4.05, top4Rate: 0.618, pickRate: 0.147 },
  { name: "Elderwood Ezreal", tier: "S", sortOrder: 3, avgPlace: 4.2, top4Rate: 0.582, pickRate: 0.085 },
  { name: "Blossom Sett Ashe", tier: "A", sortOrder: 5, avgPlace: 4.42, top4Rate: 0.521, pickRate: 0.0125 },
  { name: "Flora Malphite", tier: "A", sortOrder: 4, avgPlace: 4.35, top4Rate: 0.54, pickRate: 0.035 },
  { name: "Defender Cassiopeia", tier: "B", sortOrder: 6, avgPlace: 4.75, top4Rate: 0.44, pickRate: 0.008 },
];

describe("sortComps", () => {
  it("sorts by tier ascending (default) and descending", () => {
    const asc = sortComps(sampleComps, "tier", "asc").map((c) => c.name);
    // S tier (ordered by sortOrder: Draven 1, Ashe 2, Elderwood 3), then A tier (Flora 4, Blossom 5), then B (Defender 6)
    expect(asc).toEqual([
      "Draven Fast 9",
      "Ashe Fast 9",
      "Elderwood Ezreal",
      "Flora Malphite",
      "Blossom Sett Ashe",
      "Defender Cassiopeia",
    ]);

    const desc = sortComps(sampleComps, "tier", "desc").map((c) => c.name);
    expect(desc[0]).toBe("Defender Cassiopeia"); // B tier leads
  });

  it("sorts by avgPlace ascending (lowest/best placement first), placing nulls at end", () => {
    const asc = sortComps(sampleComps, "avg", "asc").map((c) => c.name);
    expect(asc).toEqual([
      "Draven Fast 9", // 4.05
      "Elderwood Ezreal", // 4.20
      "Flora Malphite", // 4.35
      "Blossom Sett Ashe", // 4.42
      "Defender Cassiopeia", // 4.75
      "Ashe Fast 9", // null
    ]);

    const desc = sortComps(sampleComps, "avg", "desc").map((c) => c.name);
    expect(desc).toEqual([
      "Defender Cassiopeia", // 4.75
      "Blossom Sett Ashe", // 4.42
      "Flora Malphite", // 4.35
      "Elderwood Ezreal", // 4.20
      "Draven Fast 9", // 4.05
      "Ashe Fast 9", // null remains at end
    ]);
  });

  it("sorts by top4Rate descending (highest rate first), placing nulls at end", () => {
    const desc = sortComps(sampleComps, "top4", "desc").map((c) => c.name);
    expect(desc).toEqual([
      "Draven Fast 9", // 61.8%
      "Elderwood Ezreal", // 58.2%
      "Flora Malphite", // 54.0%
      "Blossom Sett Ashe", // 52.1%
      "Defender Cassiopeia", // 44.0%
      "Ashe Fast 9", // null
    ]);

    const asc = sortComps(sampleComps, "top4", "asc").map((c) => c.name);
    expect(asc[0]).toBe("Defender Cassiopeia"); // 44.0%
    expect(asc[asc.length - 1]).toBe("Ashe Fast 9"); // null at end
  });

  it("sorts by pickRate descending (most played first), placing nulls at end", () => {
    const desc = sortComps(sampleComps, "pick", "desc").map((c) => c.name);
    expect(desc).toEqual([
      "Draven Fast 9", // 14.7%
      "Elderwood Ezreal", // 8.5%
      "Flora Malphite", // 3.5%
      "Blossom Sett Ashe", // 1.25%
      "Defender Cassiopeia", // 0.8%
      "Ashe Fast 9", // null
    ]);

    const asc = sortComps(sampleComps, "pick", "asc").map((c) => c.name);
    expect(asc[0]).toBe("Defender Cassiopeia"); // 0.8%
    expect(asc[asc.length - 1]).toBe("Ashe Fast 9"); // null at end
  });

  it("breaks ties with tier then name", () => {
    const tiedComps: SortableComp[] = [
      { name: "Comp B", tier: "A", avgPlace: 4.3 },
      { name: "Comp A", tier: "S", avgPlace: 4.3 },
      { name: "Comp C", tier: "A", avgPlace: 4.3 },
    ];
    const sorted = sortComps(tiedComps, "avg", "asc").map((c) => c.name);
    expect(sorted).toEqual(["Comp A", "Comp B", "Comp C"]);
  });
});
