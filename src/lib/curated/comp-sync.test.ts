import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  assignCarries,
  buildCompYaml,
  cellToHex,
  compDifficulty,
  compFingerprint,
  compStyle,
  isGenerated,
  parseCell,
  pickItems,
  placeUnits,
  slugify,
  type CarryCandidate,
  type CompSource,
  type CompUnitInput,
} from "./comp-sync";
import { compFileSchema } from "./schemas";

const unit = (over: Partial<CompUnitInput> & { apiName: string }): CompUnitInput => ({
  share: 0.9,
  star: 2,
  cells: [],
  builds: [],
  ...over,
});

describe("cellToHex", () => {
  it("counts the feed's cells from the back row forward", () => {
    // The anchor for this whole mapping, taken from real data: in every comp checked,
    // ranged carries sit in cells 1-7 and tanks in cells 22-28.
    expect(cellToHex(1)).toEqual({ row: 3, col: 0 });
    expect(cellToHex(7)).toEqual({ row: 3, col: 6 });
    expect(cellToHex(25)).toEqual({ row: 0, col: 3 });
    expect(cellToHex(28)).toEqual({ row: 0, col: 6 });
  });

  it("covers all 28 hexes exactly once", () => {
    const seen = new Set<string>();
    for (let cell = 1; cell <= 28; cell++) {
      const hex = cellToHex(cell)!;
      seen.add(`${hex.row},${hex.col}`);
    }
    expect(seen.size).toBe(28);
  });

  it("refuses a cell off the board rather than writing a bad hex", () => {
    expect(cellToHex(0)).toBeUndefined();
    expect(cellToHex(29)).toBeUndefined();
    expect(cellToHex(1.5)).toBeUndefined();
  });

  it("reads cell names, and only cell names", () => {
    expect(parseCell("cell_12")).toBe(12);
    expect(parseCell("12")).toBeUndefined();
    expect(parseCell("cell_")).toBeUndefined();
  });
});

describe("placeUnits", () => {
  it("gives the most-played unit its favourite hex and the other its next one", () => {
    const placed = placeUnits([
      unit({ apiName: "Rare", share: 0.4, cells: [{ cell: "cell_1", count: 900 }, { cell: "cell_2", count: 100 }] }),
      unit({ apiName: "Core", share: 0.99, cells: [{ cell: "cell_1", count: 500 }] }),
    ]);
    expect(placed).toEqual([
      { apiName: "Core", row: 3, col: 0 },
      { apiName: "Rare", row: 3, col: 1 },
    ]);
  });

  it("never puts two units on one hex, even when they all want the same one", () => {
    const cells = [{ cell: "cell_25", count: 10 }];
    const placed = placeUnits(Array.from({ length: 8 }, (_, i) => unit({ apiName: `U${i}`, share: 1 - i / 100, cells })));
    expect(new Set(placed.map((p) => `${p.row},${p.col}`)).size).toBe(8);
    expect(placed).toHaveLength(8);
  });

  it("still places a unit the feed gave no position for", () => {
    const placed = placeUnits([unit({ apiName: "Unseen", cells: [] })]);
    expect(placed).toHaveLength(1);
    expect(placed[0]).toMatchObject({ apiName: "Unseen" });
  });
});

describe("pickItems", () => {
  const held = unit({
    apiName: "DA_18_Ashe",
    builds: [
      { items: ["A", "B", "C"], count: 900, avgPlace: 4.1 },
      { items: ["D", "E", "F"], count: 400, avgPlace: 3.9 },
      { items: [], count: 2000, avgPlace: 4.4 },
    ],
  });

  it("takes the best-sampled build that holds items", () => {
    expect(pickItems(held, () => true)).toEqual(["A", "B", "C"]);
  });

  it("skips a whole rejected build rather than stripping the bad item out of it", () => {
    expect(pickItems(held, (_unit, items) => !items.includes("B"))).toEqual(["D", "E", "F"]);
  });

  it("leaves a unit empty-handed when no build survives", () => {
    expect(pickItems(held, () => false)).toEqual([]);
  });
});

describe("assignCarries", () => {
  const candidate = (over: Partial<CarryCandidate> & { apiName: string }): CarryCandidate => ({
    row: 0,
    col: 0,
    star: 2,
    carry: false,
    items: [],
    share: 0.9,
      builds: [],
    ...over,
  });

  it("marks the units that actually hold a full set, in build order", () => {
    const board = assignCarries([
      candidate({ apiName: "Second", items: ["a", "b", "c"], builds: [{ items: [], count: 100, avgPlace: 4 }] }),
      candidate({ apiName: "Tank", items: ["x"] }),
      candidate({ apiName: "First", items: ["d", "e", "f"], builds: [{ items: [], count: 900, avgPlace: 4 }] }),
    ]);
    const byName = new Map(board.map((row) => [row.apiName, row]));
    expect(byName.get("First")).toMatchObject({ carry: true, priority: 1 });
    expect(byName.get("Second")).toMatchObject({ carry: true, priority: 2 });
    expect(byName.get("Tank")!.carry).toBe(false);
    expect(byName.get("Tank")!.priority).toBeUndefined();
  });

  it("stops handing out priority after three, since a fourth means nothing", () => {
    const board = assignCarries(
      Array.from({ length: 5 }, (_, i) =>
        candidate({
          apiName: `C${i}`,
          items: ["a", "b", "c"],
          builds: [{ items: [], count: 900 - i, avgPlace: 4 }],
        }),
      ),
    );
    expect(board.filter((row) => row.priority !== undefined).map((row) => row.priority)).toEqual([1, 2, 3]);
    // Still carries, though: they hold items, they just have no build order.
    expect(board.every((row) => row.carry)).toBe(true);
  });

  it("names one carry even when nobody held a full set, so the comp still validates", () => {
    const board = assignCarries([
      candidate({ apiName: "Holder", items: ["a", "b"] }),
      candidate({ apiName: "Empty", items: [] }),
    ]);
    expect(board.filter((row) => row.carry).map((row) => row.apiName)).toEqual(["Holder"]);
  });

  it("never gives a priority to a unit with no items, which validateComp rejects", () => {
    const board = assignCarries([candidate({ apiName: "Empty", items: [] })]);
    expect(board[0]!.priority).toBeUndefined();
  });

  it("does not call a one-item unit a carry when others hold a full set", () => {
    // A unit whose most-played build is a single Thief's Gloves: written with one item,
    // so it must not also be written as a three-item carry.
    const board = assignCarries([
      candidate({ apiName: "Gloves", items: ["tg"], builds: [{ items: ["tg"], count: 9000, avgPlace: 4 }] }),
      candidate({ apiName: "Real", items: ["a", "b", "c"], builds: [{ items: [], count: 100, avgPlace: 4 }] }),
    ]);
    const byName = new Map(board.map((row) => [row.apiName, row]));
    expect(byName.get("Real")).toMatchObject({ carry: true, priority: 1 });
    expect(byName.get("Gloves")!.carry).toBe(false);
  });
});

describe("compStyle", () => {
  const carry = (cost: number, star: number) => [{ apiName: "C", cost, star, carry: true }];

  it("reads a three-starred cheap carry as a reroll comp, whatever level it ends on", () => {
    expect(compStyle(9, carry(1, 3))).toBe("reroll_1");
    expect(compStyle(8, carry(2, 3))).toBe("reroll_2");
    expect(compStyle(7, carry(3, 3))).toBe("reroll_3");
  });

  it("falls back to the final level when nothing is three-starred", () => {
    expect(compStyle(10, carry(5, 2))).toBe("fast9");
    expect(compStyle(9, carry(4, 2))).toBe("fast9");
    expect(compStyle(8, carry(4, 2))).toBe("fast8");
    expect(compStyle(7, carry(4, 2))).toBe("flex");
  });

  it("ignores a three-starred unit that is not the carry, and a 4-cost that is", () => {
    expect(compStyle(9, [{ apiName: "Tank", cost: 1, star: 3, carry: false }])).toBe("fast9");
    expect(compStyle(9, carry(4, 3))).toBe("fast9");
  });

  it("rates reaching 9 the hardest ask", () => {
    expect(compDifficulty("fast9", 9)).toBe(3);
    expect(compDifficulty("reroll_2", 8)).toBe(2);
    expect(compDifficulty("fast8", 8)).toBe(2);
    expect(compDifficulty("flex", 7)).toBe(1);
  });
});

describe("slugify", () => {
  it("closes up apostrophes and dots, and dashes everything else", () => {
    expect(slugify("Kog'Maw Rapidfire")).toBe("kogmaw-rapidfire");
    expect(slugify("Lunar Aphelios Nidalee")).toBe("lunar-aphelios-nidalee");
    expect(slugify("  Fast 9  ")).toBe("fast-9");
  });

  it("produces a slug the schema accepts", () => {
    for (const name of ["Kog'Maw Rapidfire", "Dr. Mundo Brawler", "Flora Fatalis"]) {
      expect(slugify(name)).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });
});

describe("buildCompYaml", () => {
  const source: CompSource = {
    slug: "lunar-aphelios",
    name: "Lunar Aphelios",
    tier: "S",
    style: "fast8",
    difficulty: 2,
    patch: "18.10",
    order: 1,
    gem: true,
    summary: "Ends at level 8.",
    avgPlace: 4.2307,
    pickRate: 2.0649,
    levelRecommended: 8,
    earlyUnits: ["DA_18_Varus"],
    flexUnits: ["DA_18_Sett"],
    board: [
      { apiName: "DA_18_Aphelios", row: 3, col: 0, star: 2, carry: true, priority: 1, items: ["DA_InfinityEdge"] },
      { apiName: "DA_Amumu18", row: 0, col: 3, star: 1, carry: false, items: [] },
    ],
    guide: "**Early:** one.\n\n**Levelling:** two.",
    provenance: ["Source: test."],
  };
  const text = buildCompYaml(source);

  it("writes a file the seed's own schema accepts", () => {
    const parsed = compFileSchema.safeParse(parse(text));
    expect(parsed.success).toBe(true);
  });

  it("marks the file as generated, on the line that decides whether it is overwritten", () => {
    expect(isGenerated(text)).toBe(true);
    expect(isGenerated(text.replace(/^# GENERATED[^\n]*\n/, ""))).toBe(false);
  });

  it("quotes the patch, so 18.10 does not read back as the number 18.1", () => {
    expect(text).toContain('patch: "18.10"');
  });

  it("rounds the rates the schema takes as percentages", () => {
    expect(text).toContain("avg_place: 4.23");
    expect(text).toContain("pick_rate: 2.06");
  });

  it("writes one unit per line, so a moved unit is a one-line diff", () => {
    expect(text).toContain("  - { unit: DA_18_Aphelios, row: 3, col: 0, carry: true, priority: 1, items: [ DA_InfinityEdge ] }");
    expect(text).toContain("  - { unit: DA_Amumu18, row: 0, col: 3, star: 1 }");
  });

  it("leaves out what the schema defaults, and keeps what it does not", () => {
    // star 2 is the default, so only Amumu's 1 is written.
    expect(text).not.toContain("star: 2");
    expect(text).toContain("star: 1");
    expect(text).toContain("gem: true");
  });

  it("keeps the guide readable rather than one quoted line", () => {
    expect(text).toContain("guide: |");
  });

  it("is byte-identical for identical input", () => {
    expect(buildCompYaml(source)).toBe(text);
  });

  describe("compFingerprint", () => {
    it("ignores the summary, so a bigger sample alone is not a change", () => {
      const restated = buildCompYaml({ ...source, summary: "Ends at level 8. 99,999 boards." });
      expect(compFingerprint(restated)).toBe(compFingerprint(text));
    });

    it("sees a moved unit, a new tier and a changed item", () => {
      const moved = buildCompYaml({
        ...source,
        board: [{ ...source.board[0]!, col: 2 }, source.board[1]!],
      });
      expect(compFingerprint(moved)).not.toBe(compFingerprint(text));
      expect(compFingerprint(buildCompYaml({ ...source, tier: "A" }))).not.toBe(compFingerprint(text));
    });

    it("treats an unreadable file as no fingerprint rather than throwing", () => {
      expect(compFingerprint("board: [unclosed")).toBe("");
    });
  });
});
