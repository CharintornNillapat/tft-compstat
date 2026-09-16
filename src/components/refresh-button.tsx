"use client";

import { useState, useTransition } from "react";
import { refreshMyMatches } from "@/lib/sync/actions";
import type { SyncResult } from "@/lib/sync/sync-service";
import { formatCountdown, useNow } from "./relative-time";

/** Human wording for each sync outcome (architecture §9 "states"). */
function describe(result: SyncResult): string {
  switch (result.status) {
    case "ok":
      return result.newMatches > 0
        ? `Synced ${result.newMatches} new ${result.newMatches === 1 ? "match" : "matches"} (${result.calls} calls)`
        : `Up to date (${result.calls} calls)`;
    case "skipped":
      return "On cooldown — try again shortly";
    case "rate_limited":
      return `Rate limited — retry in ${result.retryAfterS}s`;
    case "error":
      return result.message;
  }
}

/**
 * The dashboard's refresh. The Server Action is bounded by the same lock and
 * cooldown as the cron, so a spammed button can't reach Riot more than once every
 * two minutes (§5.2 layer 3). The countdown is only a courtesy — the gate is in the DB.
 */
export function RefreshButton({ nextAllowedAt }: { nextAllowedAt: string | null }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  // Seeded from the action's own result, so the countdown starts the moment the
  // sync returns instead of waiting for the re-render to bring a new prop down.
  const [cooldownAt, setCooldownAt] = useState<string | null>(null);
  const now = useNow();
  const latest = cooldownAt ?? nextAllowedAt;
  const countdown = now === null ? null : formatCountdown(latest, now);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending || countdown !== null}
        onClick={() =>
          startTransition(async () => {
            const result = await refreshMyMatches();
            setCooldownAt(result.nextAllowedAt);
            setMessage(describe(result));
          })
        }
        // Taller on a phone, where this is a thumb target rather than a pointer one.
        className="rounded border border-line bg-panel px-2.5 py-1.5 text-[13px] hover:border-zinc-600 disabled:cursor-not-allowed disabled:opacity-50 sm:px-2 sm:py-1"
      >
        {pending ? "Syncing…" : "Refresh"}
      </button>
      <span aria-live="polite" className="text-muted tabular-nums">
        {countdown ? `Cooldown ${countdown}` : message}
      </span>
    </div>
  );
}
