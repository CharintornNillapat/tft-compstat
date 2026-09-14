import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { must, type QueryResult } from "@/lib/supabase/result";
import { getCachedSupabase } from "@/lib/supabase/server";
import type { NameBook } from "./names";

/**
 * The api-name dictionary the dashboard resolves display names against
 * (architecture §8). Cached as one entry under the `static` tag, which
 * `pnpm sync:static` already revalidates — a stable key, so it's a hit on
 * essentially every request.
 *
 * `pickNames` trims this before it crosses to the client: the full book holds
 * every item in the set (771 in Set 18) and must never be shipped whole.
 */

export type StaticNames = {
  /** From `tft_sets.is_active`; null when no set is marked active. */
  activeSet: { id: number; name: string } | null;
  names: NameBook;
};

/** PostgREST caps a response at 1000 rows, and Set 18 alone has 771 items. */
async function selectAll<T>(
  page: (from: number, to: number) => PromiseLike<QueryResult<T[]>>,
  context: string,
  pageSize = 1000,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const batch = must(await page(from, from + pageSize - 1), context);
    rows.push(...batch);
    if (batch.length < pageSize) return rows;
  }
}

export async function getStaticNames(): Promise<StaticNames> {
  "use cache";
  cacheTag("static");
  cacheLife("days");

  const db = getCachedSupabase();
  const [set, champions, traits, items] = await Promise.all([
    db.from("tft_sets").select("id, name").eq("is_active", true).maybeSingle(),
    // Deliberately not filtered by set: an older match references that set's
    // character ids, and rendering them as raw api names would be a regression.
    selectAll((from, to) => db.from("champions").select("api_name, name, cost, icon_url").range(from, to), "champions"),
    selectAll((from, to) => db.from("traits").select("api_name, name, icon_url").range(from, to), "traits"),
    selectAll((from, to) => db.from("items").select("api_name, name, icon_url").range(from, to), "items"),
  ]);

  const activeSet = must(set, "active set");

  return {
    activeSet: activeSet ? { id: activeSet.id, name: activeSet.name } : null,
    names: {
      champions: Object.fromEntries(
        champions.map((row) => [row.api_name, { name: row.name, cost: row.cost, iconUrl: row.icon_url }]),
      ),
      traits: Object.fromEntries(traits.map((row) => [row.api_name, { name: row.name, iconUrl: row.icon_url }])),
      items: Object.fromEntries(items.map((row) => [row.api_name, { name: row.name, iconUrl: row.icon_url }])),
    },
  };
}
