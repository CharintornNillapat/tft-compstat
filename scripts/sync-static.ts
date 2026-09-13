/**
 * CommunityDragon → tft_sets, traits, champions, items (architecture §4.2), then
 * revalidates the site's "static" cache tag. Trait types come from MetaTFT's lookup
 * file, the one source that has them; without it the stored types are kept.
 *
 *   pnpm sync:static              newest standard set in the live game data
 *   pnpm sync:static --set 18     a specific set
 *   pnpm sync:static --dry-run    fetch and transform only; nothing is written
 *
 * Every step is an idempotent upsert, so re-running fixes a failed run.
 */
import { parseArgs } from "node:util";
import { z } from "zod";
import {
  buildStaticSnapshot,
  CDRAGON_ORIGIN,
  cdragonPatch,
  parseCdragonTft,
  pickSet,
  type StaticSnapshot,
} from "@/lib/static/cdragon";
import { ITEM_KINDS, CHAMPION_COSTS, TRAIT_KINDS, type TraitKind } from "@/lib/static/game";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { chunks, must, selectAll } from "./lib/db";
import { fetchTraitKinds } from "./lib/meta-feed";
import { revalidateSite } from "./lib/revalidate";

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GET ${url} failed: ${response.status} ${response.statusText}`);
  return response.json();
}

/**
 * Trait types from MetaTFT's lookup, the only source that has them. Undefined when
 * unavailable, which leaves `traits.kind` untouched rather than clearing it: the
 * tooltip loses a subtitle, and nothing else depends on it.
 */
async function fetchKinds(setId: number): Promise<Map<string, TraitKind> | undefined> {
  try {
    const kinds = await fetchTraitKinds(setId);
    if (kinds.size) return kinds;
    console.warn(`MetaTFT lists no trait types for set ${setId}; traits.kind left as it was.`);
  } catch (error) {
    console.warn(`MetaTFT trait types unavailable (${(error as Error).message}); traits.kind left as it was.`);
  }
  return undefined;
}

function countBy<T, K extends string | number>(rows: readonly T[], key: (row: T) => K, order: readonly K[]) {
  const counts = new Map<K, number>();
  for (const row of rows) counts.set(key(row), (counts.get(key(row)) ?? 0) + 1);
  return order.filter((k) => counts.has(k)).map((k) => `${k} ${counts.get(k)}`).join(" · ");
}

function printSummary({ set, traits, champions, items, warnings }: StaticSnapshot) {
  console.log(`\nSet ${set.id} · ${set.name} (${set.mutator}), game data ${set.patch}`);
  const typed = traits.filter((t) => t.kind);
  const kinds = typed.length ? `  (${countBy(typed, (t) => t.kind as TraitKind, TRAIT_KINDS)})` : "  (types unchanged)";
  console.log(`  traits     ${traits.length}${kinds}`);
  console.log(`  champions  ${champions.length}  (cost ${countBy(champions, (c) => c.cost, CHAMPION_COSTS)})`);
  console.log(`  items      ${items.length}  (${countBy(items, (i) => i.kind, ITEM_KINDS)})`);
  if (warnings.length) console.log(`  warnings:\n${warnings.map((w) => `    - ${w}`).join("\n")}`);
}

async function writeSnapshot({ set, traits, champions, items }: StaticSnapshot) {
  const db = getSupabaseAdmin();

  // One active set (unique index): clear the old flag before setting the new one.
  must(await db.from("tft_sets").update({ is_active: false }).eq("is_active", true).neq("id", set.id), "tft_sets");
  must(await db.from("tft_sets").upsert(set), "tft_sets");
  // Traits before champions and items: emblems reference traits.
  must(await db.from("traits").upsert(traits), "traits");
  must(await db.from("champions").upsert(champions), "champions");
  for (const batch of chunks(items, 500)) must(await db.from("items").upsert(batch), "items");

  // Items that left the pool stay (old lists and matches reference them) but go inactive.
  const current = new Set(items.map((item) => item.api_name));
  const active = await selectAll(
    (from, to) => db.from("items").select("api_name").eq("is_active", true).order("api_name").range(from, to),
    "items",
  );
  const stale = active.map((row) => row.api_name).filter((apiName) => !current.has(apiName));
  for (const batch of chunks(stale, 100)) {
    must(await db.from("items").update({ is_active: false }).in("api_name", batch), "items");
  }
  return { deactivated: stale.length };
}

async function main() {
  const { values } = parseArgs({
    options: { set: { type: "string" }, "dry-run": { type: "boolean", default: false } },
  });
  const setNumber = values.set === undefined ? undefined : Number(values.set);
  if (setNumber !== undefined && !Number.isInteger(setNumber)) {
    throw new Error(`--set expects a set number, got "${values.set}"`);
  }

  const { version } = z
    .object({ version: z.string() })
    .parse(await getJson(`${CDRAGON_ORIGIN}/latest/content-metadata.json`));
  const patch = cdragonPatch(version);
  console.log(`Fetching CommunityDragon TFT data for game version ${patch}…`);
  const data = parseCdragonTft(await getJson(`${CDRAGON_ORIGIN}/${patch}/cdragon/tft/en_us.json`));
  const traitKinds = await fetchKinds(pickSet(data, setNumber).number);
  const snapshot = buildStaticSnapshot(data, { patch, setNumber, traitKinds });
  printSummary(snapshot);
  if (values["dry-run"]) {
    console.log("\nDry run: nothing written.");
    return;
  }

  const { deactivated } = await writeSnapshot(snapshot);
  console.log(`\nWrote set ${snapshot.set.id}; ${deactivated} items from earlier pools marked inactive.`);
  await revalidateSite(["static"]);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
