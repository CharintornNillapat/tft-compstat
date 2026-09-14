import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabasePublicEnv } from "@/lib/env";
import { createRetryingFetch } from "./retry";
import type { Database } from "./types";

/**
 * Read client for Server Components: anon key, RLS-enforced (public read only).
 * The site has no logins, so there is no session or cookie handling.
 */
function createReadClient(fetch?: typeof globalThis.fetch) {
  const env = supabasePublicEnv();
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(fetch ? { global: { fetch } } : {}),
  });
}

let client: ReturnType<typeof createReadClient> | undefined;

/**
 * Plain `fetch`, no retries. Used by the uncached `/me` and `/` player reads
 * (`stats/queries.ts`, architecture §6.3): those are already the fast path — a
 * live request behind a header that shows a cooldown countdown — and a retry
 * would only add latency ahead of the error state those pages already handle.
 */
export function getSupabase() {
  return (client ??= createReadClient());
}

let cachedClient: ReturnType<typeof createReadClient> | undefined;

/**
 * Same project and anon key, but every request retries a transient failure with
 * exponential backoff (`retry.ts`) before giving up. For the cached, prerendered
 * reads only — `curated/queries.ts`, `curated/bis.ts`, `static/lookup.ts` and
 * `planner/planner-data.ts` — where one flaky response can fail an entire
 * `next build` (a real Supabase Gateway Timeout did exactly that, Phase 6 Task
 * 12) and a build is already the slowest, least latency-sensitive path here.
 */
export function getCachedSupabase() {
  return (cachedClient ??= createReadClient(createRetryingFetch()));
}
