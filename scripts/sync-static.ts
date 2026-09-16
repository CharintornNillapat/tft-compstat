/**
 * CommunityDragon → tft_sets, traits, champions, items (architecture §4.2), then
 * revalidates the site's "static" cache tag. Trait types and the ability and item
 * tooltip text come from MetaTFT's lookup file, the one source that has them; without
 * it the stored types and text are kept.
 *
 *   pnpm sync:static              newest standard set in the live game data
 *   pnpm sync:static --set 18     a specific set
 *   pnpm sync:static --dry-run    fetch and transform only; nothing is written
 *   pnpm sync:static --allow-set-rollover   permit flipping the active set
 *
 * Every step is an idempotent upsert, so re-running fixes a failed run.
 *
 * A **set rollover** is refused unless `--allow-set-rollover` is passed. The daily
 * workflow runs this unattended, and flipping `tft_sets.is_active` to a set with no
 * curated folder would leave `/comps`, `/tiers` and `/bis` prerendering an empty
 * site. Failing loudly is the point: a new set is a person's decision.
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
  teamPlannerCodes,
  teamPlannerUrl,
  type TooltipSource,
} from "@/lib/static/cdragon";
import { ITEM_KINDS, CHAMPION_COSTS, TRAIT_KINDS, type TraitKind } from "@/lib/static/game";
import { lookupItemSchema, lookupUnitSchema, parseLookupEntries } from "@/lib/static/metatft-text";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { chunks, must, selectAll } from "./lib/db";
import { fetchSetLookup } from "./lib/meta-feed";
import { revalidateSite } from "./lib/revalidate";

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GET ${url} failed: ${response.status} ${response.statusText}`);
  return response.json();
}

/**
 * Trait types and tooltip text from MetaTFT's lookup, the only source that has either.
 * Each is undefined when unavailable, which leaves `traits.kind` and the text columns
 * untouched rather than clearing them: a tooltip loses a subtitle or a paragraph, and
 * nothing else depends on either.
 */
async function fetchLookup(setId: number): Promise<{ traitKinds?: Map<string, TraitKind>; tooltips?: TooltipSource }> {
  try {
    const lookup = await fetchSetLookup(setId);
    const units = parseLookupEntries(lookupUnitSchema, lookup.units);
    const items = parseLookupEntries(lookupItemSchema, lookup.items);
    if (units.skipped + items.skipped) {
      console.warn(`Skipped ${units.skipped + items.skipped} MetaTFT lookup entries with an unexpected shape.`);
    }
    if (!lookup.kinds.size) console.warn(`MetaTFT lists no trait types for set ${setId}; traits.kind left as it was.`);
    if (!lookup.patch) console.warn("MetaTFT's lookup names no patch; tooltip text left as it was.");
    return {
      traitKinds: lookup.kinds.size ? lookup.kinds : undefined,
      // Without a patch label there is nothing honest to print under the numbers, so no text is written.
      tooltips:
        lookup.patch && units.parsed.length
          ? { source: lookup.patch, units: units.parsed, items: new Map(items.parsed.map((item) => [item.apiName, item])) }
          : undefined,
    };
  } catch (error) {
    console.warn(`MetaTFT lookup unavailable (${(error as Error).message}); trait types and tooltip text left as they were.`);
    return {};
  }
}

/**
 * Team Planner ids from the client's planner roster, pinned to the same game-data
 * directory as everything else. Undefined when unavailable, which leaves
 * `champions.team_planner_code` untouched: the comp page's "Copy team code" keeps
 * the codes it had, and nothing else depends on them.
 */
async function fetchPlannerCodes(patch: string, mutator: string): Promise<Map<string, number> | undefined> {
  try {
    const codes = teamPlannerCodes(await getJson(teamPlannerUrl(patch)), mutator);
    if (codes.size) return codes;
    console.warn(`The Team Planner file lists no ${mutator} champions; team_planner_code left as it was.`);
  } catch (error) {
    console.warn(`Team Planner codes unavailable (${(error as Error).message}); team_planner_code left as it was.`);
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
  const planned = champions.filter((c) => c.team_planner_code != null).length;
  const plannerNote = champions.some((c) => "team_planner_code" in c) ? `${planned} of ${champions.length}` : "unchanged";
  console.log(`  planner    ${plannerNote}`);
  const voiced = champions.filter((c) => c.ability_text != null).length;
  const source = champions.find((c) => c.text_source)?.text_source ?? items.find((i) => i.text_source)?.text_source;
  const abilityNote = champions.some((c) => "ability_text" in c) ? `${voiced} of ${champions.length} (${source ?? "no source"})` : "unchanged";
  console.log(`  abilities  ${abilityNote}`);
  console.log(`  items      ${items.length}  (${countBy(items, (i) => i.kind, ITEM_KINDS)})`);
  const described = items.filter((i) => i.description != null || i.stats != null).length;
  console.log(`  item text  ${items.some((i) => "description" in i) ? `${described} of ${items.length}` : "unchanged"}`);
  if (warnings.length) console.log(`  warnings:\n${warnings.map((w) => `    - ${w}`).join("\n")}`);
}

/**
 * The set `tft_sets.is_active` currently points at, or null before the first sync.
 * Read on its own rather than inside `writeSnapshot` so the rollover check can run
 * during a dry run too.
 */
async function activeSetId(): Promise<number | null> {
  const row = must(
    await getSupabaseAdmin().from("tft_sets").select("id").eq("is_active", true).maybeSingle(),
    "active set",
  );
  return row?.id ?? null;
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
    options: {
      set: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      "allow-set-rollover": { type: "boolean", default: false },
    },
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
  const picked = pickSet(data, setNumber);
  const [{ traitKinds, tooltips }, plannerCodes] = await Promise.all([
    fetchLookup(picked.number),
    fetchPlannerCodes(patch, picked.mutator),
  ]);
  const snapshot = buildStaticSnapshot(data, { patch, setNumber, traitKinds, plannerCodes, tooltips });
  printSummary(snapshot);

  const current = await activeSetId();
  const rollover = current !== null && current !== snapshot.set.id;
  if (rollover && !values["allow-set-rollover"]) {
    throw new Error(
      `Set rollover refused: the active set is ${current}, the live game data is set ${snapshot.set.id}.\n` +
        `A new set needs a curated folder (data/curated/${snapshot.set.id}/) and a look at the site before it goes live,\n` +
        `so this is never done unattended. Re-run with --allow-set-rollover once that is ready,\n` +
        `or pin this run with --set ${current}.`,
    );
  }

  if (values["dry-run"]) {
    console.log(rollover ? `\nDry run: would roll the active set ${current} over to ${snapshot.set.id}.` : "\nDry run: nothing written.");
    return;
  }

  if (rollover) console.log(`\nRolling the active set over from ${current} to ${snapshot.set.id} (--allow-set-rollover).`);
  const { deactivated } = await writeSnapshot(snapshot);
  console.log(`\nWrote set ${snapshot.set.id}; ${deactivated} items from earlier pools marked inactive.`);
  await revalidateSite(["static"]);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
