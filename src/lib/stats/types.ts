import type { DerivedTrait, DerivedUnit } from "@/lib/sync/derive";

/**
 * Stats contracts (architecture §6.3). Everything here is pure data: the stats
 * modules are computed on read over ≤50 cached rows, on the server for the first
 * paint and again in the browser whenever the filter changes.
 */

export const LAST_N_OPTIONS = [10, 20, 50] as const;
export type LastN = (typeof LAST_N_OPTIONS)[number];

export type StatsFilter = { lastN: LastN; queues: "ranked" | "all"; currentSetOnly: boolean };

export const DEFAULT_FILTER: StatsFilter = { lastN: 20, queues: "ranked", currentSetOnly: true };

/** Rows fetched per request — the superset every `StatsFilter` narrows. */
export const FETCH_LIMIT = 50;

/**
 * What the dashboard needs from a `player_matches` row, trimmed for the client
 * payload: `gold_left`, `damage_to_players`, `time_eliminated_s`, `last_round`,
 * `puuid` and `derived_version` are dropped because nothing renders them.
 *
 * Keeping this separate from the generated Supabase row type is also what lets the
 * stats tests build inputs as plain object literals.
 */
export type MatchRow = {
  matchId: string;
  /** ISO timestamp, from `game_datetime`. */
  playedAt: string;
  queueId: number;
  setNumber: number;
  /** 1–8. */
  placement: number;
  level: number | null;
  carryUnit: string | null;
  primaryTraits: string[];
  compKey: string | null;
  /** Active traits only. */
  traits: DerivedTrait[];
  units: DerivedUnit[];
};

/**
 * Counts of 1st through 8th place. A fixed-length tuple rather than `number[]`,
 * because under `noUncheckedIndexedAccess` that makes `dist[0]` a `number` instead
 * of `number | undefined` at every call site.
 */
export type PlacementDist = readonly [number, number, number, number, number, number, number, number];

export const EMPTY_DIST: PlacementDist = [0, 0, 0, 0, 0, 0, 0, 0];

export type PlayerSummary = {
  games: number;
  /** Unrounded; formatted at render so the rounding rule lives in one place. */
  avgPlacement: number;
  /** 0–1. */
  top4Rate: number;
  /** 0–1. */
  winRate: number;
  /** Nulls excluded; 0 when no row reports a level. */
  avgLevel: number;
  placementDist: PlacementDist;
  /** Placements, newest first (§6.3). */
  recent: number[];
};

export type CompStat = {
  compKey: string;
  label: string;
  games: number;
  avgPlacement: number;
  /** 0–1. */
  top4Rate: number;
};

/** Also used for items — an api name with the record it appeared in. */
export type UnitStat = { apiName: string; games: number; avgPlacement: number };

/** Placement 1–4 of 8 is a top four, which is what "winning" means in TFT terms. */
export const TOP4_CUTOFF = 4;
