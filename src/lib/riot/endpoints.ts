import type { RiotClient } from "./client";
import { accountHost, matchHost, platformHost, type MatchRegion } from "./routing";
import {
  accountRegionSchema,
  accountSchema,
  leagueEntriesSchema,
  matchIdsSchema,
  summonerSchema,
  type AccountDto,
  type LeagueEntryDto,
  type SummonerDto,
} from "./schemas";

/** The Riot endpoints this app uses (architecture §5.1). One function per row of that table. */

/** Ranked TFT queue, as `leagueEntry.queueType` names it. */
export const RANKED_TFT = "RANKED_TFT";

/** Match ids per sync (§5.2 layer 2 caps new matches at 20). */
export const MATCH_PAGE_SIZE = 20;

const encode = (value: string) => encodeURIComponent(value);

/** Riot ID → puuid. Setup only; account-v1 has no SEA host, so SEA platforms use `asia`. */
export function getAccountByRiotId(
  client: RiotClient,
  gameName: string,
  tagLine: string,
): Promise<AccountDto> {
  const url = `${accountHost(client.platform)}/riot/account/v1/accounts/by-riot-id/${encode(gameName)}/${encode(tagLine)}`;
  return client.get(url, accountSchema, "account by riot id");
}

/**
 * The shard Riot itself says the account plays TFT on. Authoritative, unlike the
 * platform → region table, which is why setup checks it (§11).
 */
export async function getTftRegion(client: RiotClient, puuid: string): Promise<string> {
  const url = `${accountHost(client.platform)}/riot/account/v1/region/by-game/tft/by-puuid/${encode(puuid)}`;
  const { region } = await client.get(url, accountRegionSchema, "account region");
  return region;
}

export function getSummoner(client: RiotClient, puuid: string): Promise<SummonerDto> {
  const url = `${platformHost(client.platform)}/tft/summoner/v1/summoners/by-puuid/${encode(puuid)}`;
  return client.get(url, summonerSchema, "summoner");
}

export function getLeagueEntries(client: RiotClient, puuid: string): Promise<LeagueEntryDto[]> {
  const url = `${platformHost(client.platform)}/tft/league/v1/by-puuid/${encode(puuid)}`;
  return client.get(url, leagueEntriesSchema, "league entries");
}

export type MatchIdOptions = {
  start?: number;
  count?: number;
  /** Overrides the routing table — used by setup to probe which host answers. */
  region?: MatchRegion;
};

export function getMatchIds(
  client: RiotClient,
  puuid: string,
  { start = 0, count = MATCH_PAGE_SIZE, region }: MatchIdOptions = {},
): Promise<string[]> {
  const host = region ? `https://${region}.api.riotgames.com` : matchHost(client.platform);
  const url = `${host}/tft/match/v1/matches/by-puuid/${encode(puuid)}/ids?start=${start}&count=${count}`;
  return client.get(url, matchIdsSchema, "match ids");
}

/** Unparsed on purpose: the full response is stored in `matches.raw` (§4.4). */
export function getMatchRaw(client: RiotClient, matchId: string, region?: MatchRegion): Promise<unknown> {
  const host = region ? `https://${region}.api.riotgames.com` : matchHost(client.platform);
  return client.getRaw(`${host}/tft/match/v1/matches/${encode(matchId)}`);
}
