"use server";

import { refresh } from "next/cache";
import { getTrackedPuuid, syncPlayer, type SyncResult } from "./sync-service";

/**
 * The dashboard's refresh button (architecture §5.3). Public, like the rest of the
 * site, but bounded by the same lock and 120s cooldown as every other trigger — the
 * UI shows the countdown from `sync_state.next_allowed_at`.
 */
export async function refreshMyMatches(): Promise<SyncResult> {
  const puuid = await getTrackedPuuid();
  if (!puuid) {
    return {
      status: "error",
      message: "No tracked account; run `pnpm riot:setup`.",
      newMatches: 0,
      calls: 0,
      nextAllowedAt: new Date().toISOString(),
    };
  }

  const result = await syncPlayer(puuid, "manual");

  /**
   * Unconditionally, and `refresh()` rather than `revalidatePath("/me")`. The old
   * code only re-rendered when new matches landed, so a "you're up to date" refresh
   * left the sync badge and the cooldown countdown showing pre-sync values. And what
   * changed is the route's *uncached* server content, which is exactly what
   * `refresh()` re-runs — `revalidatePath` would throw away the prerendered shell,
   * which is the one part that didn't change.
   */
  refresh();
  return result;
}
