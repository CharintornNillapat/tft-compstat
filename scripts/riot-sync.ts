/**
 * Runs one sync locally, through the same `SyncService` the cron and the refresh
 * button use (architecture §5.3) — lock, cooldown, budget and all.
 *
 *   pnpm riot:sync                 as the manual trigger
 *   pnpm riot:sync --trigger cron  also refreshes the profile
 *
 * Useful for verifying the rate-limit behaviour without waiting for the daily cron.
 */
import { parseArgs } from "node:util";
import { getTrackedPuuid, syncPlayer, type SyncTrigger } from "@/lib/sync/sync-service";

const TRIGGERS: SyncTrigger[] = ["cron", "manual", "stale-read"];

async function main() {
  const { values } = parseArgs({ options: { trigger: { type: "string", default: "manual" } } });
  const trigger = values.trigger as SyncTrigger;
  if (!TRIGGERS.includes(trigger)) {
    throw new Error(`--trigger expects one of ${TRIGGERS.join(", ")}, got "${values.trigger}"`);
  }

  const puuid = await getTrackedPuuid();
  if (!puuid) throw new Error("No tracked account. Run `pnpm riot:setup` first.");

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
