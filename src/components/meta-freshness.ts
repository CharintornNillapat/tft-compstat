/**
 * How old the curated meta data is, for the header pill's sync dot. Pure and
 * client-safe, so the age can be computed in the browser (architecture §8): the
 * pill prerenders into the static shell, and a server-computed "2h ago" would be
 * frozen at build time.
 */

/** A daily workflow that has not landed in over a day has missed at least one run. */
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export type MetaFreshness = {
  /** `unknown` before hydration, and whenever nothing has been seeded. */
  state: "unknown" | "fresh" | "stale";
  /** Short age, e.g. "40m", "6h", "3d". Null when unknown. */
  age: string | null;
};

/** "40m" under an hour, "6h" under two days, "3d" beyond. */
export function formatAge(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/**
 * `updatedAt` is `tier_lists.updated_at`, written by every `pnpm seed:curated`.
 * An absent or unparseable timestamp is `unknown` rather than assumed fresh —
 * the §6.4 rule: visibly unknown beats silently wrong.
 */
export function metaFreshness(updatedAt: string | null, now: number): MetaFreshness {
  if (!updatedAt) return { state: "unknown", age: null };
  const at = Date.parse(updatedAt);
  if (Number.isNaN(at)) return { state: "unknown", age: null };
  // A clock skew that puts the seed in the future is not staleness.
  const ageMs = Math.max(0, now - at);
  return { state: ageMs < STALE_AFTER_MS ? "fresh" : "stale", age: formatAge(ageMs) };
}
