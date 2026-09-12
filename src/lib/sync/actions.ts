"use server";

import { revalidatePath } from "next/cache";
import { getTrackedPuuid, syncPlayer, type SyncResult } from "./sync-service";

/**
 * The dashboard's refresh button (architecture §5.3). Public, like the rest of the
 * site, but bounded by the same lock and 120s cooldown as every other trigger — the
 * UI shows the countdown from `sync_state.next_allowed_at`.
 */
export async function refreshMyMatches(): Promise<SyncResult> {
  const puuid = await getTrackedPuuid();
  if (!puuid) {
    return { status: "error", message: "No tracked account; run `pnpm riot:setup`.", newMatches: 0, calls: 0 };
  }

  const result = await syncPlayer(puuid, "manual");
  // Only re-render when something actually landed.
  if (result.status === "ok" && result.newMatches > 0) revalidatePath("/me");
  return result;
}
