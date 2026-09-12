import { describe, expect, it } from "vitest";
import { parseMetaBrief } from "./meta-brief";

const FILE = "data/curated/18/meta-notes.yaml";

const parse = (yaml: string) => parseMetaBrief(FILE, yaml);
const messages = (yaml: string) => parse(yaml).issues.map((issue) => issue.message);

const VALID = `patch: "18.2"
title: Patch 18.2 brief
buffs:
  - Ashe — Ranger bonus up 15%
nerfs:
  - Draven — base AD down
tip: Hold Recurve Bows.
`;

describe("parseMetaBrief", () => {
  it("reads a full brief", () => {
    expect(parse(VALID).brief).toEqual({
      patch: "18.2",
      title: "Patch 18.2 brief",
      buffs: ["Ashe — Ranger bonus up 15%"],
      nerfs: ["Draven — base AD down"],
      tip: "Hold Recurve Bows.",
    });
  });

  it("defaults the title from the patch, and the lists to empty", () => {
    const { brief } = parse('patch: "18.2"\nnerfs: [Draven]\n');
    expect(brief).toEqual({ patch: "18.2", title: "Patch 18.2 brief", buffs: [], nerfs: ["Draven"], tip: null });
  });

  it("rejects an unquoted patch, which YAML would read as a number", () => {
    // 18.10 unquoted parses as 18.1, silently naming the wrong patch.
    expect(messages("patch: 18.10\ntip: Anything.\n")).toEqual([
      'must be a quoted string like "18.1" (unquoted, 18.10 would read as the number 18.1)',
    ]);
  });

  it("rejects a brief with nothing in it", () => {
    expect(messages('patch: "18.2"\n')).toEqual([
      "needs at least one buff, nerf or tip; an empty brief would render an empty card",
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
