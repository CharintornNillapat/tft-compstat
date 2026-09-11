import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdminEnv } from "@/lib/env";
import type { Database } from "./types";

/**
 * Service-role client: bypasses RLS. The only path for writes (sync, seeds)
 * and for server-only tables (`matches`, `sync_state`). Never import from
 * client code — `server-only` makes that a build error.
 */
function createAdminClient() {
  const env = supabaseAdminEnv();
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

let client: ReturnType<typeof createAdminClient> | undefined;

export function getSupabaseAdmin() {
  return (client ??= createAdminClient());
}
