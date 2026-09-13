import { describe, expect, it } from "vitest";
import { splitGuide, UNLABELLED } from "./guide-sections";

// The shape `pnpm sync:meta` writes (hunter-sivir, patch 18.2).
const GENERATED = `**Early:** the most-played opener is Akali, Ornn, Shen, Varus.

**Levelling:** level 7 by 3-6, level 8 by 4-2, level 9 by 5-3.

**Items**, in the order to build them:
- **Sivir**: Infinity Edge, Spear of Shojin, Striker's Flail
- **Ashe**: Last Whisper, Red Buff, Spear of Shojin

**Positioning:** every unit is on the hex it was played on most often in this comp.

_Generated from MetaTFT DIAMOND+ boards on patch 18.2: 15,814 boards, avg 4.33._
`;

// A hand-written guide (draven-fast-9): Mid and Late, and a closing unlabelled paragraph.
const HAND_WRITTEN = `**Early:** Play the strongest AD opener you're offered.

**Mid:** Push levels and take losses in stage 4 if you have to.

**Late:** At 9, roll for Draven and the 5-cost frontline.

**Positioning:** Draven in a back corner, with Ezreal beside him.

Missing level 9 usually means a bottom-4 finish.
`;

describe("splitGuide", () => {
  it("splits a generated guide into its labelled blocks and footnote", () => {
    const outline = splitGuide(GENERATED)!;
    expect(outline.sections.map((s) => [s.label, s.kind])).toEqual([
      ["Early", "stage"],
      ["Levelling", "stage"],
      ["Items", "reference"],
      ["Positioning", "reference"],
    ]);
    expect(outline.footnote).toBe("_Generated from MetaTFT DIAMOND+ boards on patch 18.2: 15,814 boards, avg 4.33._");
  });

  it("drops the label and capitalises the sentence it leaves behind", () => {
    const [early, , items] = splitGuide(GENERATED)!.sections;
    expect(early!.body).toBe("The most-played opener is Akali, Ornn, Shen, Varus.");
    expect(items!.body).toBe(
      "In the order to build them:\n- **Sivir**: Infinity Edge, Spear of Shojin, Striker's Flail\n- **Ashe**: Last Whisper, Red Buff, Spear of Shojin",
    );
  });

  it("turns an unlabelled paragraph into a tip", () => {
    const outline = splitGuide(HAND_WRITTEN)!;
    expect(outline.sections.map((s) => s.label)).toEqual(["Early", "Mid", "Late", "Positioning", UNLABELLED]);
    expect(outline.sections.at(-1)).toEqual({
      label: UNLABELLED,
      kind: "reference",
      body: "Missing level 9 usually means a bottom-4 finish.",
    });
    expect(outline.footnote).toBeNull();
  });

  it("keeps a list after a blank line with the block above, and merges loose paragraphs", () => {
    const outline = splitGuide("**Items**:\n\n- Blue Buff\n- Rabadon's\n\nOne tip.\n\nAnother tip.\r\n\r\n- and a list")!;
    expect(outline.sections).toEqual([
      { label: "Items", kind: "reference", body: "- Blue Buff\n- Rabadon's" },
      { label: UNLABELLED, kind: "reference", body: "One tip.\n\nAnother tip.\n\n- and a list" },
    ]);
  });

  it("keeps a label with nothing after it", () => {
    expect(splitGuide("**Positioning:**\n\n**Late Game:** cap.")!.sections).toEqual([
      { label: "Positioning", kind: "reference", body: "" },
      { label: "Late Game", kind: "stage", body: "Cap." },
    ]);
  });

  it("does not read a sentence that opens in bold as a label", () => {
    expect(splitGuide("**Don't** slam Guinsoo's early.\n\nIt belongs on Draven.")).toBeNull();
    expect(splitGuide("**Hold** your items: Draven needs them.")).toBeNull();
  });

  it("only takes an italic block as the footnote when it closes the guide", () => {
    const outline = splitGuide("**Early:** one.\n\n_an aside_\n\n**Late:** two.")!;
    expect(outline.footnote).toBeNull();
    expect(outline.sections.map((s) => s.label)).toEqual(["Early", UNLABELLED, "Late"]);
  });

  it("is null for a guide with no labels, footnote or not", () => {
    expect(splitGuide("Just play Draven.")).toBeNull();
    expect(splitGuide("_Only a note._")).toBeNull();
    expect(splitGuide("")).toBeNull();
  });
});
