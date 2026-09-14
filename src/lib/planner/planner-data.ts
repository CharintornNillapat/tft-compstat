import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { buildTraitDetails, parseTraitEffects } from "@/lib/curated/trait-details";
import { isTraitKind, type TraitBreakpoint } from "@/lib/static/game";
import { must } from "@/lib/supabase/result";
import { getSupabase } from "@/lib/supabase/server";
import { PLANNER_ITEM_KINDS } from "./board";
import { plannerItemPool, type PlannerData } from "./catalog";

/**
 * Everything `/planner` needs, read once per `static` revalidation (architecture §8):
 * the active set's champions, the holdable items, and its traits with tooltip text.
 * Nothing here depends on the request, so the page prerenders static and the
 * builder runs entirely in the browser.
 */

export async function getPlannerData(): Promise<PlannerData | null> {
  "use cache";
  cacheTag("static");
  cacheLife("days");

  const db = getSupabase();
  const set = must(await db.from("tft_sets").select("id, name, mutator").eq("is_active", true).maybeSingle(), "active set");
  if (!set) return null;

  const [championRows, traitRows, itemRows] = await Promise.all([
    db.from("champions").select("api_name, name, cost, traits, icon_url, team_planner_code").eq("set_id", set.id),
    db.from("traits").select("api_name, name, icon_url, breakpoints, description, effects, kind").eq("set_id", set.id),
    db
      .from("items")
      .select("api_name, name, icon_url, kind, grants_trait")
      .eq("is_active", true)
      .in("kind", [...PLANNER_ITEM_KINDS])
      .like("api_name", "DA\\_%"),
  ]);
  const champions = must(championRows, "planner champions");
  const traits = must(traitRows, "planner traits");
  const items = plannerItemPool(must(itemRows, "planner items"));

  // sync-static writes breakpoints in exactly this shape (architecture §4.8).
  const breakpointsOf = (row: (typeof traits)[number]) => row.breakpoints as TraitBreakpoint[];

  return {
    set,
    catalog: {
      champions: Object.fromEntries(
        champions.map((row) => [
          row.api_name,
          {
            apiName: row.api_name,
            name: row.name,
            cost: row.cost,
            iconUrl: row.icon_url,
            traits: row.traits,
            plannerCode: row.team_planner_code,
          },
        ]),
      ),
      items: Object.fromEntries(items.map((item) => [item.apiName, item])),
      traitNames: Object.fromEntries(traits.map((row) => [row.api_name, row.name])),
    },
    traits: Object.fromEntries(
      traits.map((row) => [row.api_name, { name: row.name, iconUrl: row.icon_url, breakpoints: breakpointsOf(row) }]),
    ),
    traitDetails: buildTraitDetails({
      traits: traits.map((row) => ({
        apiName: row.api_name,
        breakpoints: breakpointsOf(row),
        description: row.description,
        effects: parseTraitEffects(row.effects),
        kind: isTraitKind(row.kind) ? row.kind : null,
      })),
      champions: champions.map((row) => ({
        apiName: row.api_name,
        name: row.name,
        cost: row.cost,
        iconUrl: row.icon_url,
        traits: row.traits,
      })),
    }),
  };
}
