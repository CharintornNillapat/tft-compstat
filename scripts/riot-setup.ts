/**
 * One-time Riot account setup, plus the live checks architecture §11 leaves open.
 *
 *   pnpm riot:setup                  resolve the Riot ID, run the probes, seed the rows
 *   pnpm riot:setup --dry-run        probe and report only; nothing is written
 *   pnpm riot:setup --fixture        also save a real match as a test fixture
 *
 * The probes exist because Riot's own docs disagree about the SEA shards: the launch
 * announcement puts TH2 under regional value SEA, the current routing reference lists
 * SEA as OC1/SG2/TW2/VN2 only. Rather than trust either, this asks the live API and
 * prints what actually answers, so §5.1 can record a verified table.
 *
 * Budget: ~7 calls, well inside one client's cap of 25.
 */
import { parseArgs } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { riotEnv } from "@/lib/env";
import { RiotClient } from "@/lib/riot/client";
import { RiotError } from "@/lib/riot/errors";
import {
  getAccountByRiotId,
  getLeagueEntries,
  getMatchIds,
  getMatchRaw,
  getSummoner,
  getTftRegion,
  RANKED_TFT,
} from "@/lib/riot/endpoints";
import { accountRegion, matchRegion, MATCH_REGIONS, type MatchRegion } from "@/lib/riot/routing";
import { matchSchema } from "@/lib/riot/schemas";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { must } from "./lib/db";

const FIXTURE_PATH = "src/lib/sync/__fixtures__/match.json";

/** Runs a probe without letting a failure end the script; returns the error instead. */
async function probe<T>(run: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: Error }> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    return { ok: false, error: error as Error };
  }
}

/** Status 0 means the request never landed (DNS/connection), so show the cause instead. */
const describeError = (error: Error) =>
  error instanceof RiotError && error.status > 0 ? `${error.name} (${error.status})` : error.message;

/**
 * Replaces every puuid with a stable placeholder, so a committed fixture carries no
 * real account identifiers — `matches.raw` holds other players' lobby data, which is
 * exactly why anon can't read that table (§4.6).
 */
function anonymizeMatch(raw: unknown, mePuuid: string): { match: unknown; mePlaceholder: string } {
  const ids = new Map<string, string>();
  let n = 0;
  const placeholder = (puuid: string) => {
    if (puuid === mePuuid) return "PUUID_ME";
    let mapped = ids.get(puuid);
    if (!mapped) ids.set(puuid, (mapped = `PUUID_P${++n}`));
    return mapped;
  };
  // puuids appear as metadata.participants[] and info.participants[].puuid.
  const walk = (value: unknown): unknown => {
    if (typeof value === "string") return /^[\w-]{70,}$/.test(value) ? placeholder(value) : value;
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, k === "puuid" && typeof v === "string" ? placeholder(v) : walk(v)]));
    }
    return value;
  };
  return { match: walk(raw), mePlaceholder: "PUUID_ME" };
}

async function main() {
  const { values } = parseArgs({
    options: {
      "dry-run": { type: "boolean", default: false },
      fixture: { type: "boolean", default: false },
      /** How many recent matches to scan when picking the fixture. */
      "fixture-scan": { type: "string" },
    },
  });
  const env = riotEnv();
  const platform = env.RIOT_PLATFORM;
  const client = new RiotClient({ apiKey: env.RIOT_API_KEY, platform });

  console.log(`Riot ID ${env.RIOT_GAME_NAME}#${env.RIOT_TAG_LINE} on platform ${platform}`);
  console.log(`Routing table says: account ${accountRegion(platform)}, match ${matchRegion(platform)}\n`);

  // 1. Riot ID → puuid (account-v1, account region).
  const account = await getAccountByRiotId(client, env.RIOT_GAME_NAME, env.RIOT_TAG_LINE);
  console.log(`✓ puuid resolved (${account.puuid.slice(0, 8)}…, ${account.puuid.length} chars)`);

  // 2. Riot's own answer for which shard this account plays TFT on (§11). This is
  // authoritative: Riot has been consolidating the SEA shards, so the platform in
  // the env may name a host that no longer exists.
  const region = await probe(() => getTftRegion(client, account.puuid));
  if (region.ok) {
    console.log(`✓ Riot reports TFT region "${region.value}" for this account`);
    if (region.value.toLowerCase() !== platform) {
      console.log(
        `\n⚠ RIOT_PLATFORM is "${platform}" but Riot says this account is on "${region.value.toLowerCase()}".\n` +
          `  Set RIOT_PLATFORM=${region.value.toLowerCase()} in .env.local (and on Vercel) and re-run.\n`,
      );
    }
  } else {
    console.log(`· region lookup unavailable: ${describeError(region.error)}`);
  }

  // 3. Which match host actually serves this puuid. Every region is probed, because
  // a wrong-shard host answers 200 with an empty list rather than 404 — so "it
  // responded" proves nothing and only a non-empty result identifies the real shard.
  const matchProbes = new Map<MatchRegion, number | string>();
  let workingRegion: MatchRegion | undefined;
  let ids: string[] = [];
  for (const candidate of MATCH_REGIONS) {
    const result = await probe(() => getMatchIds(client, account.puuid, { count: 20, region: candidate }));
    if (!result.ok) {
      matchProbes.set(candidate, describeError(result.error));
      continue;
    }
    matchProbes.set(candidate, result.value.length);
    if (result.value.length > ids.length) {
      workingRegion = candidate;
      ids = result.value;
    }
  }
  for (const [candidate, outcome] of matchProbes) {
    const mark = typeof outcome === "number" && outcome > 0 ? "✓" : "·";
    const detail = typeof outcome === "number" ? `${outcome} match ids` : outcome;
    console.log(`${mark} match-v1 @ ${candidate.padEnd(8)} ${detail}`);
  }
  if (!workingRegion) {
    throw new Error(
      "No match region returned any matches for this puuid. If Riot reported a different " +
        "region above, set RIOT_PLATFORM to that shard and re-run.",
    );
  }
  if (workingRegion !== matchRegion(platform)) {
    console.log(`\n⚠ Routing table is wrong: ${platform} match traffic belongs on "${workingRegion}", not "${matchRegion(platform)}". Update src/lib/riot/routing.ts.`);
  }

  // 4. Platform-host endpoints.
  const summoner = await probe(() => getSummoner(client, account.puuid));
  console.log(
    summoner.ok
      ? `✓ summoner-v1 @ ${platform}: level ${summoner.value.summonerLevel ?? "?"}`
      : `· summoner-v1 @ ${platform}: ${describeError(summoner.error)}`,
  );

  const league = await probe(() => getLeagueEntries(client, account.puuid));
  if (league.ok) {
    const ranked = league.value.find((entry) => entry.queueType === RANKED_TFT);
    console.log(
      `✓ league-v1 by-puuid @ ${platform}: ${
        ranked ? `${ranked.tier} ${ranked.rank} ${ranked.leaguePoints} LP (${ranked.wins}W/${ranked.losses}L)` : `${league.value.length} entries, no ${RANKED_TFT}`
      }`,
    );
  } else {
    console.log(`⚠ league-v1 by-puuid @ ${platform}: ${describeError(league.error)} — §11 fallback needed`);
  }

  // 5. Optional: a real match, for the derivation tests and the Set 18 §11 questions.
  if (values.fixture) {
    // Scan a few and keep the richest board: a match where the account busted out
    // early has no items and no active traits, which answers none of the questions.
    const scan = ids.slice(0, Number(values["fixture-scan"] ?? 5));
    const scored = [];
    for (const id of scan) {
      const raw = await getMatchRaw(client, id, workingRegion);
      const parsed = client.parse(raw, matchSchema, "match");
      const mine = parsed.info.participants.find((p) => p.puuid === account.puuid);
      const items = mine?.units.reduce((n, u) => n + u.itemNames.length, 0) ?? 0;
      const active = mine?.traits.filter((t) => (t.style ?? 0) > 0).length ?? 0;
      scored.push({ id, raw, parsed, mine, score: items + active * 2 });
      console.log(`  scanned ${id}: placement ${mine?.placement ?? "?"}, ${items} items, ${active} active traits`);
    }
    const best = scored.reduce((a, b) => (b.score > a.score ? b : a), scored[0]!);
    if (!best) {
      console.log("\n· No matches to capture as a fixture.");
    } else {
      const { id: matchId, raw, parsed, mine: me } = best;
      console.log(`\nMatch ${matchId} — the §11 Set 18 questions:`);
      console.log(`  tft_set_number  ${parsed.info.tft_set_number}`);
      console.log(`  game_version    ${parsed.info.game_version}`);
      console.log(`  queue_id        ${parsed.info.queue_id}  (tft_game_type ${parsed.info.tft_game_type ?? "—"})`);
      console.log(`  my placement    ${me?.placement ?? "?"} of ${parsed.info.participants.length}`);
      console.log(`  unit ids        ${me?.units.slice(0, 3).map((u) => u.character_id).join(", ") ?? "—"}`);
      console.log(`  item names      ${me?.units.flatMap((u) => u.itemNames).slice(0, 4).join(", ") || "—"}`);
      const active = me?.traits.filter((t) => (t.style ?? 0) > 0) ?? [];
      console.log(`  active traits   ${active.map((t) => `${t.name}=${t.num_units}/s${t.style}/t${t.tier_current}of${t.tier_total}`).join(" ") || "—"}`);
      console.log(`  style codes     ${[...new Set(active.map((t) => t.style))].sort().join(", ") || "—"}`);

      const { match } = anonymizeMatch(raw, account.puuid);
      await mkdir(path.dirname(FIXTURE_PATH), { recursive: true });
      await writeFile(FIXTURE_PATH, `${JSON.stringify(match, null, 2)}\n`);
      console.log(`\n✓ Fixture written to ${FIXTURE_PATH} (all puuids replaced; mine is PUUID_ME).`);
    }
  }

  console.log(`\nCalls used: ${client.calls}`);
  if (values["dry-run"]) {
    console.log("Dry run: nothing written.");
    return;
  }

  // 6. Seed the account and its sync state.
  const db = getSupabaseAdmin();
  must(
    await db.from("riot_accounts").upsert({
      puuid: account.puuid,
      game_name: account.gameName ?? env.RIOT_GAME_NAME,
      tag_line: account.tagLine ?? env.RIOT_TAG_LINE,
      platform,
      profile_icon_id: summoner.ok ? (summoner.value.profileIconId ?? null) : null,
      summoner_level: summoner.ok ? (summoner.value.summonerLevel ?? null) : null,
    }),
    "riot_accounts",
  );
  must(await db.from("sync_state").upsert({ puuid: account.puuid, status: "idle" }), "sync_state");
  console.log("✓ Seeded riot_accounts and sync_state.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
