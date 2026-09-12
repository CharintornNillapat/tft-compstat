/**
 * Deeper match history than a sync fetches, run locally (architecture §5.3).
 * Uses the same client and limiter, but walks `start` offsets and gets a wider
 * budget, because it isn't bound by a serverless function's lifetime.
 *
 *   pnpm riot:backfill                     next 100 matches beyond what's cached
 *   pnpm riot:backfill --count 200         how many ids to walk
 *   pnpm riot:backfill --start 100         begin deeper in the history
 *   pnpm riot:backfill --dry-run           report what's missing; nothing is written
 *
 * It deliberately bypasses `acquire_sync_lock`: it's a one-off local job, not a
 * trigger, and it must not consume the site's cooldown. Don't run it while a sync is.
 */
import { parseArgs } from "node:util";
import { riotEnv } from "@/lib/env";
import { RiotClient } from "@/lib/riot/client";
import { getMatchIds, getMatchRaw } from "@/lib/riot/endpoints";
import { matchSchema } from "@/lib/riot/schemas";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { deriveMatch, derivePlayerMatch } from "@/lib/sync/derive";
import { getTrackedPuuid, loadStaticLookup } from "@/lib/sync/sync-service";
import { must } from "./lib/db";

/** Riot caps a single ids request at 100. */
const ID_PAGE = 100;

async function main() {
  const { values } = parseArgs({
    options: {
      count: { type: "string", default: "100" },
      start: { type: "string", default: "0" },
      "dry-run": { type: "boolean", default: false },
    },
  });
  const count = Number(values.count);
  const start = Number(values.start);
  if (!Number.isInteger(count) || count <= 0) throw new Error(`--count expects a positive integer`);
  if (!Number.isInteger(start) || start < 0) throw new Error(`--start expects a non-negative integer`);

  const db = getSupabaseAdmin();
  const puuid = await getTrackedPuuid(db);
  if (!puuid) throw new Error("No tracked account. Run `pnpm riot:setup` first.");

  const env = riotEnv();
  // Generous budget: ids pages plus one call per new match, with slack.
  const client = new RiotClient({ apiKey: env.RIOT_API_KEY, platform: env.RIOT_PLATFORM, budget: count + 20 });

  // Walk the id pages first, so the summary knows the whole job before fetching details.
  const ids: string[] = [];
  for (let offset = start; ids.length < count; offset += ID_PAGE) {
    const page = await getMatchIds(client, puuid, { start: offset, count: Math.min(ID_PAGE, count - ids.length) });
    if (page.length === 0) break;
    ids.push(...page);
  }
  console.log(`Walked ${ids.length} ids from offset ${start}.`);

  const stored = must(await db.from("matches").select("match_id").in("match_id", ids), "matches");
  const known = new Set(stored.map((row) => row.match_id));
  const missing = ids.filter((id) => !known.has(id));
  console.log(`${missing.length} not cached yet.`);

  if (values["dry-run"] || missing.length === 0) {
    if (values["dry-run"]) console.log("Dry run: nothing written.");
    return;
  }

  const lookup = await loadStaticLookup(db);
  let written = 0;
  for (const matchId of missing) {
    const raw = await getMatchRaw(client, matchId);
    const dto = client.parse(raw, matchSchema, `match ${matchId}`);
    // One match per commit, as in the sync, so an interruption keeps what it fetched.
    must(await db.from("matches").upsert(deriveMatch(dto, raw)), "matches");
    must(await db.from("player_matches").upsert(derivePlayerMatch(dto, puuid, lookup)), "player_matches");
    written++;
    if (written % 10 === 0) console.log(`  ${written}/${missing.length}…`);
  }

  console.log(`Stored ${written} matches in ${client.calls} calls.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
