/**
 * Cache tags on `use cache` reads (architecture §8). `/api/revalidate` accepts
 * exactly these, so add a tag here before tagging anything with it.
 *   static: sets, traits, champions, items (scripts/sync-static.ts)
 *   tiers:  tier lists (scripts/seed-curated.ts)
 *   comps:  comps and their boards (scripts/seed-curated.ts)
 */
export const CACHE_TAGS = ["static", "tiers", "comps"] as const;

export type CacheTag = (typeof CACHE_TAGS)[number];
