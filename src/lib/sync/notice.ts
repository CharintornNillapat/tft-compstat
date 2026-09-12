import type { SyncState } from "./sync-service";

/**
 * The banner `/me` shows when the cache can't refresh (architecture §5.2 layer 7,
 * §9 "states"). Pure, so the wording is testable without a database.
 *
 * Every case here still serves cached data — a failed sync degrades the page's
 * freshness, never its content.
 */

export type SyncNotice = { tone: "warn" | "error"; title: string; detail?: string };

/** Riot's 401/403 message, set by `sync-service.ts`. A dev key expires every 24h. */
const KEY_EXPIRED = /invalid|expired/i;

export function syncNotice(
  state: Pick<SyncState, "status" | "last_error" | "next_allowed_at"> | null,
  now: number,
): SyncNotice | null {
  if (!state) return null;

  if (state.status === "rate_limited") {
    const until = state.next_allowed_at ? Date.parse(state.next_allowed_at) : NaN;
    const seconds = Number.isNaN(until) ? null : Math.max(Math.ceil((until - now) / 1000), 0);
    return {
      tone: "warn",
      title: "Rate limited by Riot — showing cached data.",
      detail: seconds === null ? "It will retry on the next sync." : `Retrying in ${seconds}s.`,
    };
  }

  if (state.status === "error") {
    const message = state.last_error ?? "";
    if (KEY_EXPIRED.test(message)) {
      return {
        tone: "error",
        title: "Riot API key invalid or expired — showing cached data.",
        // A Development key lasts 24h; a Personal key doesn't expire (§5.2).
        detail: "Renew the key, or apply for a Personal key so it stops expiring.",
      };
    }
    return { tone: "error", title: "Last sync failed — showing cached data.", detail: message || undefined };
  }

  return null;
}
