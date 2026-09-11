import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabasePublicEnv } from "@/lib/env";
import type { Database } from "./types";

/**
 * Read client for Server Components: anon key, RLS-enforced (public read only).
 * The site has no logins, so there is no session or cookie handling.
 */
function createReadClient() {
  const env = supabasePublicEnv();
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

let client: ReturnType<typeof createReadClient> | undefined;

export function getSupabase() {
  return (client ??= createReadClient());
}
