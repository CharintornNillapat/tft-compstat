import type { RiotPlatform } from "@/lib/env";

/**
 * Platform → host routing (architecture §5.1). Pure and client-safe.
 *
 * Riot splits its endpoints across three host families:
 *   * platform hosts (`th2.api.riotgames.com`) — tft-summoner-v1, tft-league-v1
 *   * match regions (`sea.api.riotgames.com`) — tft-match-v1
 *   * account regions (`asia.api.riotgames.com`) — account-v1, which has no SEA host
 *
 * The SEA shards are the awkward case: Riot's launch announcement lists TH2 and PH2
 * under regional value SEA, but the current routing reference enumerates SEA as only
 * OC1/SG2/TW2/VN2. `scripts/riot-setup.ts` therefore probes the live API and reports
 * what actually answers rather than trusting this table (§11).
 */

export const MATCH_REGIONS = ["americas", "europe", "asia", "sea"] as const;
export type MatchRegion = (typeof MATCH_REGIONS)[number];

/** account-v1 has no `sea` host: SEA platforms use `asia` (§5.1). */
export const ACCOUNT_REGIONS = ["americas", "europe", "asia"] as const;
export type AccountRegion = (typeof ACCOUNT_REGIONS)[number];

const MATCH_REGION_BY_PLATFORM = {
  br1: "americas", la1: "americas", la2: "americas", na1: "americas",
  eun1: "europe", euw1: "europe", me1: "europe", ru: "europe", tr1: "europe",
  jp1: "asia", kr: "asia",
  oc1: "sea", ph2: "sea", sg2: "sea", th2: "sea", tw2: "sea", vn2: "sea",
} as const satisfies Record<RiotPlatform, MatchRegion>;

export function matchRegion(platform: RiotPlatform): MatchRegion {
  return MATCH_REGION_BY_PLATFORM[platform];
}

export function accountRegion(platform: RiotPlatform): AccountRegion {
  const region = MATCH_REGION_BY_PLATFORM[platform];
  return region === "sea" ? "asia" : region;
}

export const riotHost = (routing: string) => `https://${routing}.api.riotgames.com`;

export const platformHost = (platform: RiotPlatform) => riotHost(platform);
export const matchHost = (platform: RiotPlatform) => riotHost(matchRegion(platform));
export const accountHost = (platform: RiotPlatform) => riotHost(accountRegion(platform));
