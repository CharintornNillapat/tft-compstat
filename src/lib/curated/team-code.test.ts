import { describe, expect, it } from "vitest";
import { buildTeamCode, TEAM_PLANNER_SLOTS, teamCodeHint, type PlannerUnit } from "./team-code";

// Real Set 18 boards with their CommunityDragon team_planner_code ids (16.18).
const units = (pairs: [string, number | null][]): PlannerUnit[] =>
  pairs.map(([apiName, plannerCode]) => ({ apiName, name: apiName.replace(/^DA_(18_)?|18(_\w+)?$/g, ""), plannerCode }));

const RIFTBEAST_PEBBLES = units([
  ["DA_Krug18", 1039],
  ["DA_18_Sentry", 1065],
  ["DA_Sentinel18", 1064],
  ["DA_Brambleback18", 1011],
  ["DA_Murkwolf18", 1049],
  ["DA_Scuttlecrab18", 1062],
  ["DA_Cinderling18", 1015],
  ["DA_18_GnarSmall", 1025],
  ["DA_18_ElderDragon", 1020],
]);

const ELDERWOOD_KAYLE = units([
  ["DA_18_Xayah", 1081],
  ["DA_18_Leona", 1041],
  ["DA_18_Ornn", 1055],
  ["DA_18_Kayle", 1034],
  ["DA_18_Sejuani", 1063],
  ["DA_18_Rakan", 1056],
  ["DA_18_Hecarim", 1027],
]);

const FILLER = units([
  ["DA_18_Ahri", 1001],
  ["DA_18_Akali_AD", 1002],
  ["DA_18_Alistar", 1003],
]);

const SLOTS_LENGTH = 2 + TEAM_PLANNER_SLOTS * 3;

describe("buildTeamCode", () => {
  it("encodes a nine-unit Riftbeast board as 02 + ten 3-hex slots + the set", () => {
    const result = buildTeamCode(RIFTBEAST_PEBBLES, "TFTSet18");
    // Pebbles is 1065 = 0x429, the id tactics.tools' Set 18 builder stores for it.
    expect(result?.code).toBe("0240f4294283f34194263f74013fc000TFTSet18");
    expect(result?.units).toBe(9);
    expect(result?.skipped).toEqual([]);
  });

  it("pads a seven-unit board with empty slots at the end", () => {
    expect(buildTeamCode(ELDERWOOD_KAYLE, "TFTSet18")?.code).toBe("0243941141f40a427420403000000000TFTSet18");
  });

  it("always writes exactly ten slots, from 1 to 10 units", () => {
    const pool = [...RIFTBEAST_PEBBLES, ...FILLER];
    for (let count = 1; count <= TEAM_PLANNER_SLOTS; count++) {
      const result = buildTeamCode(pool.slice(0, count), "TFTSet18");
      expect(result?.code).toHaveLength(SLOTS_LENGTH + "TFTSet18".length);
      expect(result?.units).toBe(count);
      expect(result?.code.slice(2 + count * 3, SLOTS_LENGTH)).toBe("000".repeat(TEAM_PLANNER_SLOTS - count));
    }
  });

  it("keeps the given order, so carries lead the planner", () => {
    const reversed = buildTeamCode([...ELDERWOOD_KAYLE].reverse(), "TFTSet18");
    // Hecarim 1027 = 0x403 first, then Rakan 1056 = 0x420.
    expect(reversed?.code.slice(2, 8)).toBe("403420");
  });

  it("leaves units past ten out and names them", () => {
    const eleven = [...RIFTBEAST_PEBBLES, ...FILLER.slice(0, 2)];
    const result = buildTeamCode(eleven, "TFTSet18");
    expect(result?.units).toBe(TEAM_PLANNER_SLOTS);
    expect(result?.code).toHaveLength(SLOTS_LENGTH + "TFTSet18".length);
    expect(result?.skipped).toEqual([{ name: FILLER[1]!.name, reason: "full" }]);
  });

  it("skips a unit the planner does not list, such as a non-Base Lux form", () => {
    const board = [...ELDERWOOD_KAYLE, { apiName: "DA_Lux18_Wind", name: "Lux", plannerCode: null }];
    const result = buildTeamCode(board, "TFTSet18");
    expect(result?.code).toBe(buildTeamCode(ELDERWOOD_KAYLE, "TFTSet18")?.code);
    expect(result?.skipped).toEqual([{ name: "Lux", reason: "no-code" }]);
  });

  it("does not let a skipped unit take a slot from a later one", () => {
    const board = [{ apiName: "DA_Lux18_Wind", name: "Lux", plannerCode: null }, ...RIFTBEAST_PEBBLES, ...FILLER];
    const result = buildTeamCode(board, "TFTSet18");
    expect(result?.units).toBe(TEAM_PLANNER_SLOTS);
    expect(result?.skipped.map((unit) => unit.reason)).toEqual(["no-code", "full", "full"]);
  });

  it("treats ids a slot cannot hold as missing", () => {
    for (const plannerCode of [0, -1, 4096, 10.5, Number.NaN]) {
      const result = buildTeamCode([...ELDERWOOD_KAYLE, { apiName: "X", name: "X", plannerCode }], "TFTSet18");
      expect(result?.skipped).toEqual([{ name: "X", reason: "no-code" }]);
    }
    expect(buildTeamCode(units([["low", 1], ["high", 4095]]), "TFTSet18")?.code.slice(0, 8)).toBe("02001fff");
  });

  it("writes lowercase hex", () => {
    expect(buildTeamCode(units([["DA_18_Kayle", 0xabc]]), "TFTSet18")?.code.slice(2, 5)).toBe("abc");
  });

  it("returns null when nothing can be encoded", () => {
    expect(buildTeamCode([], "TFTSet18")).toBeNull();
    expect(buildTeamCode(units([["DA_Lux18_Wind", null]]), "TFTSet18")).toBeNull();
  });

  it("returns null for a set that is not a standard TFTSet<N>", () => {
    expect(buildTeamCode(ELDERWOOD_KAYLE, "TFTSet18_PAIRS")).toBeNull();
    expect(buildTeamCode(ELDERWOOD_KAYLE, "")).toBeNull();
  });
});

describe("teamCodeHint", () => {
  it("says where to paste when every unit is in the code", () => {
    expect(teamCodeHint(buildTeamCode(ELDERWOOD_KAYLE, "TFTSet18")!)).toBe("Paste into the TFT Team Planner (Import)");
  });

  it("names units the planner lacks and units past ten", () => {
    const board = [{ apiName: "DA_Lux18_Wind", name: "Lux", plannerCode: null }, ...RIFTBEAST_PEBBLES, ...FILLER];
    expect(teamCodeHint(buildTeamCode(board, "TFTSet18")!)).toBe(
      `Paste into the TFT Team Planner (Import). Not in the planner: Lux. Over 10 units, left out: ${FILLER[1]!.name}, ${FILLER[2]!.name}`,
    );
  });
});
