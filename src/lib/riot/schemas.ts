import { z } from "zod";

/**
 * The subset of Riot's TFT DTOs the app reads (architecture §6.1). Every object is
 * loose, so unknown fields survive — `matches.raw` still stores the untouched
 * response, and derivation can start using a new field without a schema change.
 *
 * Riot has been inconsistent about `queue_id` (snake) vs `queueId` (camel) across
 * TFT match versions, so both are accepted and normalized.
 */

export const participantSchema = z.looseObject({
  puuid: z.string(),
  placement: z.number().int(),
  level: z.number().int().nullish(),
  last_round: z.number().int().nullish(),
  gold_left: z.number().int().nullish(),
  time_eliminated: z.number().nullish(),
  total_damage_to_players: z.number().int().nullish(),
  traits: z
    .array(
      z.looseObject({
        name: z.string(),
        num_units: z.number().int(),
        // 0 = inactive, then bronze/silver/gold/prismatic; unique traits use their own code.
        style: z.number().int().nullish(),
        tier_current: z.number().int().nullish(),
        tier_total: z.number().int().nullish(),
      }),
    )
    .default([]),
  units: z
    .array(
      z.looseObject({
        character_id: z.string(),
        itemNames: z.array(z.string()).default([]),
        /** Star level, 1–3. Riot calls it `tier`. */
        tier: z.number().int().nullish(),
        rarity: z.number().int().nullish(),
      }),
    )
    .default([]),
});

export const matchSchema = z.looseObject({
  metadata: z.looseObject({
    match_id: z.string(),
    participants: z.array(z.string()).default([]),
  }),
  info: z
    .looseObject({
      /** Epoch milliseconds. */
      game_datetime: z.number(),
      /** Seconds. */
      game_length: z.number(),
      game_version: z.string(),
      queue_id: z.number().int().nullish(),
      queueId: z.number().int().nullish(),
      tft_set_number: z.number().int().nullish(),
      tft_game_type: z.string().nullish(),
      participants: z.array(participantSchema).default([]),
    })
    .transform(({ queue_id, queueId, ...info }) => ({ ...info, queue_id: queue_id ?? queueId ?? null })),
});

export const accountSchema = z.looseObject({
  puuid: z.string(),
  gameName: z.string().nullish(),
  tagLine: z.string().nullish(),
});

/** `/riot/account/v1/region/by-game/{game}/by-puuid/{puuid}` — the authoritative shard (§11). */
export const accountRegionSchema = z.looseObject({
  puuid: z.string(),
  game: z.string().nullish(),
  region: z.string(),
});

export const summonerSchema = z.looseObject({
  puuid: z.string(),
  profileIconId: z.number().int().nullish(),
  summonerLevel: z.number().int().nullish(),
});

export const leagueEntrySchema = z.looseObject({
  queueType: z.string(),
  tier: z.string().nullish(),
  rank: z.string().nullish(),
  leaguePoints: z.number().int().nullish(),
  wins: z.number().int().nullish(),
  losses: z.number().int().nullish(),
});

export const matchIdsSchema = z.array(z.string());
export const leagueEntriesSchema = z.array(leagueEntrySchema);

export type MatchDto = z.infer<typeof matchSchema>;
export type ParticipantDto = z.infer<typeof participantSchema>;
export type AccountDto = z.infer<typeof accountSchema>;
export type SummonerDto = z.infer<typeof summonerSchema>;
export type LeagueEntryDto = z.infer<typeof leagueEntrySchema>;
