/**
 * CommunityDragon → tft_sets, traits, champions, items (architecture §4.2), then
 * revalidates the site's "static" cache tag.
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
  type StaticSnapshot,
} from "@/lib/static/cdragon";
import { ITEM_KINDS, CHAMPION_COSTS } from "@/lib/static/game";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { chunks, must, selectAll } from "./lib/db";
import { revalidateSite } from "./lib/revalidate";

const DDRAGON_ORIGIN = "https://ddragon.leagueoflegends.com";

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GET ${url} failed: ${response.status} ${response.statusText}`);
  return response.json();
}

/**
 * Shop-unit ids from Riot's Data Dragon, preferring the release that matches the
 * CommunityDragon data. Undefined when unavailable: the transform then keeps every
 * unit with a cost and traits, and warns.
 */
async function fetchPlayableIds(patch: string): Promise<Set<string> | undefined> {
  try {
    const versions = z.array(z.string()).parse(await getJson(`${DDRAGON_ORIGIN}/api/versions.json`));
    const version = versions.find((v) => v.startsWith(`${patch}.`)) ?? versions[0];
    if (!version) return undefined;
    if (!version.startsWith(`${patch}.`)) console.warn(`Data Dragon has no ${patch} release yet; using ${version}.`);
    const { data } = z
      .object({ data: z.record(z.string(), z.object({ id: z.string() })) })
      .parse(await getJson(`${DDRAGON_ORIGIN}/cdn/${version}/data/en_US/tft-champion.json`));
    return new Set(Object.values(data).map((champion) => champion.id));
  } catch (error) {
    console.warn(`Data Dragon unavailable (${(error as Error).message}).`);
    return undefined;
  }
}

function countBy<T, K extends string | number>(rows: readonly T[], key: (row: T) => K, order: readonly K[]) {
  const counts = new Map<K, number>();
  for (const row of rows) counts.set(key(row), (counts.get(key(row)) ?? 0) + 1);
  return order.filter((k) => counts.has(k)).map((k) => `${k} ${counts.get(k)}`).join(" · ");
}

function printSummary({ set, traits, champions, items, warnings }: StaticSnapshot) {
  console.log(`\nSet ${set.id} · ${set.name} (${set.mutator}), game data ${set.patch}`);
  console.log(`  traits     ${traits.length}`);
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
  const [raw, playableIds] = await Promise.all([
    getJson(`${CDRAGON_ORIGIN}/${patch}/cdragon/tft/en_us.json`),
    fetchPlayableIds(patch),
  ]);

  const snapshot = buildStaticSnapshot(parseCdragonTft(raw), { patch, setNumber, playableIds });
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
