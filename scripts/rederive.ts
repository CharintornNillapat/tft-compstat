/**
 * Recomputes `player_matches` from `matches.raw` with **0 Riot API calls**
 * (architecture §6.2). Run after changing `derive.ts` or `comp-signature.ts` and
 * bumping `DERIVED_VERSION`, or after adding a patch to `patches.ts`.
 *
 *   pnpm rederive                 rows whose derived_version is behind
 *   pnpm rederive --all           every row
 *   pnpm rederive --dry-run       report what would change; nothing is written
 */
import { parseArgs } from "node:util";
import { matchSchema } from "@/lib/riot/schemas";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { DERIVED_VERSION } from "@/lib/sync/comp-signature";
import { deriveMatch, derivePlayerMatch } from "@/lib/sync/derive";
import { loadStaticLookup } from "@/lib/sync/sync-service";
import { chunks, must, selectAll } from "./lib/db";

async function main() {
  const { values } = parseArgs({
    options: { all: { type: "boolean", default: false }, "dry-run": { type: "boolean", default: false } },
  });
  const db = getSupabaseAdmin();
  const lookup = await loadStaticLookup(db);

  const targets = await selectAll(
    (from, to) => {
      const query = db.from("player_matches").select("match_id,puuid,derived_version").order("match_id").range(from, to);
      return values.all ? query : query.lt("derived_version", DERIVED_VERSION);
    },
    "player_matches",
  );
  if (targets.length === 0) {
    console.log(`Nothing to do: every row is already at derived_version ${DERIVED_VERSION}.`);
    return;
  }
  console.log(`Rederiving ${targets.length} rows to version ${DERIVED_VERSION}…`);

  let changed = 0;
  for (const batch of chunks(targets, 100)) {
    const raws = must(
      await db.from("matches").select("match_id,raw").in("match_id", batch.map((row) => row.match_id)),
      "matches",
    );
    const rawById = new Map(raws.map((row) => [row.match_id, row.raw]));

    const matchRows = [];
    const playerRows = [];
    for (const target of batch) {
      const raw = rawById.get(target.match_id);
      if (!raw) {
        console.warn(`  ${target.match_id}: no raw stored; skipped.`);
        continue;
      }
      const dto = matchSchema.parse(raw);
      // The patch label can change too, so the match row is recomputed alongside.
      matchRows.push(deriveMatch(dto, raw));
      playerRows.push(derivePlayerMatch(dto, target.puuid, lookup));
      changed++;
    }

    if (!values["dry-run"] && playerRows.length > 0) {
      must(await db.from("matches").upsert(matchRows), "matches");
      must(await db.from("player_matches").upsert(playerRows), "player_matches");
    }
  }

  console.log(values["dry-run"] ? `Dry run: ${changed} rows would be rewritten.` : `Rewrote ${changed} rows.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
