/**
 * Runs one sync locally, through the same `SyncService` the cron and the refresh
 * button use (architecture §5.3) — lock, cooldown, budget and all.
 *
 *   pnpm riot:sync                 as the manual trigger
 *   pnpm riot:sync --trigger cron  also refreshes the profile
 *   pnpm riot:sync --force         clear any cooldown/lock first, then sync
 *
 * Useful for verifying the rate-limit behaviour without waiting for the daily cron.
 *
 * `--force` exists for verifying a rotated key (README "Rotating the Riot API
 * key"): an `AuthError` on an unattended trigger now sets a day-long cooldown
 * (`AUTH_ERROR_COOLDOWN_S`), so without it, checking a freshly-fixed key could
 * mean waiting out yesterday's failure. `acquire_sync_lock` stays unconditional
 * for every other trigger — this is a deliberate, CLI-only escape hatch, not
 * something the public refresh button or the cron route gets.
 */
import { parseArgs } from "node:util";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { must } from "@/lib/supabase/result";
import { getTrackedPuuid, syncPlayer, type SyncTrigger } from "@/lib/sync/sync-service";

const TRIGGERS: SyncTrigger[] = ["cron", "manual", "stale-read"];

async function main() {
  const { values } = parseArgs({
    options: {
      trigger: { type: "string", default: "manual" },
      force: { type: "boolean", default: false },
    },
  });
  const trigger = values.trigger as SyncTrigger;
  if (!TRIGGERS.includes(trigger)) {
    throw new Error(`--trigger expects one of ${TRIGGERS.join(", ")}, got "${values.trigger}"`);
  }

  const puuid = await getTrackedPuuid();
  if (!puuid) throw new Error("No tracked account. Run `pnpm riot:setup` first.");

  if (values.force) {
    must(
      await getSupabaseAdmin().from("sync_state").update({ next_allowed_at: null, lock_until: null }).eq("puuid", puuid),
      "sync_state",
    );
    console.log("Cleared the cooldown and lock for this account.");
  }

  const started = Date.now();
  const result = await syncPlayer(puuid, trigger);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  console.log(`${trigger} sync finished in ${seconds}s:`);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
