import { describe, expect, it } from "vitest";
import type { NameBook } from "@/lib/static/names";
import { parseMetaBrief } from "./meta-brief";

const FILE = "data/curated/18/meta-notes.yaml";

const parse = (yaml: string, names?: NameBook) => parseMetaBrief(FILE, yaml, names);
const messages = (yaml: string) => parse(yaml).issues.map((issue) => issue.message);

const mockNames: NameBook = {
  champions: {
    DA_18_Ashe: { name: "Ashe", cost: 5, iconUrl: "ashe.png" },
    DA_Draven18: { name: "Draven", cost: 5, iconUrl: "draven.png" },
    DA_18_Kennen: { name: "Kennen", cost: 5, iconUrl: "kennen.png" },
  },
  items: {
    DA_GuinsoosRageblade: { name: "Guinsoo's Rageblade", iconUrl: "guinsoo.png" },
    DA_KrakensFury: { name: "Kraken's Fury", iconUrl: "kraken.png" },
  },
  traits: {
    DA_18_Elderwood: { name: "Elderwood", iconUrl: "elderwood.png" },
  },
};

const VALID = `patch: "18.2"
title: Patch 18.2 brief
buffs:
  - Ashe — Ranger bonus up 15%
nerfs:
  - Draven — base AD down
adjustments:
  - Level 9 — XP adjusted 80 → 76
tip: Hold Recurve Bows.
`;

describe("parseMetaBrief", () => {
  it("reads a full brief with adjustments and plain strings", () => {
    expect(parse(VALID).brief).toEqual({
      patch: "18.2",
      title: "Patch 18.2 brief",
      buffs: [{ text: "Ashe — Ranger bonus up 15%" }],
      nerfs: [{ text: "Draven — base AD down" }],
      adjustments: [{ text: "Level 9 — XP adjusted 80 → 76" }],
      tip: "Hold Recurve Bows.",
    });
  });

  it("defaults the title from the patch, and the lists to empty", () => {
    const { brief } = parse('patch: "18.2"\nnerfs: [Draven]\n');
    expect(brief).toEqual({
      patch: "18.2",
      title: "Patch 18.2 brief",
      buffs: [],
      nerfs: [{ text: "Draven" }],
      adjustments: [],
      tip: null,
    });
  });

  it("resolves champion, item, and trait entities automatically from text prefix", () => {
    const yaml = `patch: "18.2"
buffs:
  - Ashe — Ranger bonus up 15%
nerfs:
  - Kraken's Fury proc rate
adjustments:
  - Elderwood — growth stacks
`;
    const { brief } = parse(yaml, mockNames);
    expect(brief?.buffs[0]).toEqual({
      text: "Ashe — Ranger bonus up 15%",
      entity: { kind: "champion", name: "Ashe", cost: 5, iconUrl: "ashe.png" },
    });
    expect(brief?.nerfs[0]).toEqual({
      text: "Kraken's Fury proc rate",
      entity: { kind: "item", name: "Kraken's Fury", iconUrl: "kraken.png" },
    });
    expect(brief?.adjustments[0]).toEqual({
      text: "Elderwood — growth stacks",
      entity: { kind: "trait", name: "Elderwood", iconUrl: "elderwood.png" },
    });
  });

  it("resolves entities from explicit entry object tags", () => {
    const yaml = `patch: "18.2"
buffs:
  - item: "Guinsoo's Rageblade"
    text: "Guinsoo's ramp faster"
  - champion: "Kennen"
    text: "Kennen 2★ survivability"
`;
    const { brief } = parse(yaml, mockNames);
    expect(brief?.buffs).toEqual([
      {
        text: "Guinsoo's ramp faster",
        entity: { kind: "item", name: "Guinsoo's Rageblade", iconUrl: "guinsoo.png" },
      },
      {
        text: "Kennen 2★ survivability",
        entity: { kind: "champion", name: "Kennen", cost: 5, iconUrl: "kennen.png" },
      },
    ]);
  });

  it("rejects an unquoted patch, which YAML would read as a number", () => {
    // 18.10 unquoted parses as 18.1, silently naming the wrong patch.
    expect(messages("patch: 18.10\ntip: Anything.\n")).toEqual([
      'must be a quoted string like "18.1" (unquoted, 18.10 would read as the number 18.1)',
    ]);
  });

  it("rejects a brief with nothing in it", () => {
    expect(messages('patch: "18.2"\n')).toEqual([
      "needs at least one buff, nerf, adjustment or tip; an empty brief would render an empty card",
    ]);
  });

  it("caps entry length and list length so the card stays a glance", () => {
    expect(messages(`patch: "18.2"\nbuffs: ["${"x".repeat(49)}"]\n`)).toEqual([
      "must be at most 48 characters, so it fits on one badge",
    ]);
    expect(messages(`patch: "18.2"\nnerfs: [${Array.from({ length: 7 }, (_, i) => `n${i}`).join(", ")}]\n`)).toEqual([
      "at most 6 fit in the card before it stops being a glance",
    ]);
  });

  it("rejects an unknown key rather than ignoring a typo", () => {
    expect(messages('patch: "18.2"\ntip: Anything.\nbufs: [Ashe]\n')[0]).toMatch(/bufs/);
  });

  it("points a bad value at its line and column", () => {
    const [issue] = parse('patch: "18.2"\nbuffs:\n  - ""\n').issues;
    expect(issue).toMatchObject({ file: FILE, path: "buffs[0]", line: 3, message: "must not be empty" });
  });

  it("reports a YAML syntax error as one issue, without a schema error on top", () => {
    const issues = parse('patch: "18.2"\n  tip: bad indent\n').issues;
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ message: expect.stringMatching(/^invalid YAML: /) });
  });
});
