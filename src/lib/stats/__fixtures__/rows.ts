import type { MatchRow } from "../types";

/**
 * A terse `MatchRow` builder for the stats tests. Defaults are a ranked Set 18 game,
 * so a test only states the fields it actually exercises.
 */
export function matchRow(overrides: Partial<MatchRow> & { placement: number }): MatchRow {
  return {
    matchId: `SG2_${overrides.placement}${overrides.playedAt ?? ""}`,
    playedAt: "2026-09-12T00:00:00.000Z",
    queueId: 1100,
    setNumber: 18,
    level: 8,
    carryUnit: null,
    primaryTraits: [],
    compKey: null,
    traits: [],
    units: [],
    ...overrides,
  };
}
