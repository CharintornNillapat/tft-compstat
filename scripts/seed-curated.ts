/**
 * Curated YAML → tier_lists + tier_entries (architecture §7), then revalidates the
 * site's "tiers" cache tag.
 *
 *   pnpm seed:curated            validate every file, then write
 *   pnpm seed:curated --dry-run  validate only
 *
 * Reads data/curated/<setId>/{champion,item}-tiers.yaml. Every file is validated
 * against the static tables before anything is written; any issue aborts the run.
 *
 * supabase-js has no transactions, so each list is written as single-statement
 * steps that never leave it empty: upsert the list, upsert its entries, prune
 * entries that left the file. Re-running fixes a failed run, and pages keep their
 * cached copy until the final revalidation.
 */
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { TIER_LIST_FILES, TIER_LIST_KINDS, type TierListKind } from "@/lib/curated/schemas";
import {
  checkTierListSet,
  formatIssue,
  validateTierList,
  type ReferenceIndex,
  type SeedIssue,
  type SeedTierList,
} from "@/lib/curated/validate";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { chunks, must, selectAll } from "./lib/db";
import { revalidateSite } from "./lib/revalidate";

const CURATED_DIR = "data/curated";

type TierFile = { file: string; setId: number; kind: TierListKind };

async function findTierFiles(): Promise<TierFile[]> {
  if (!existsSync(CURATED_DIR)) return [];
  const known = new Set(Object.values(TIER_LIST_FILES));
  const files: TierFile[] = [];
  for (const dir of await readdir(CURATED_DIR, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    if (!/^\d+$/.test(dir.name)) {
      console.warn(`Skipping ${CURATED_DIR}/${dir.name}: folders are named by set number, e.g. ${CURATED_DIR}/18.`);
      continue;
    }
    const names = await readdir(`${CURATED_DIR}/${dir.name}`);
    for (const name of names.filter((n) => /\.ya?ml$/.test(n) && !known.has(n))) {
      console.warn(`Skipping ${CURATED_DIR}/${dir.name}/${name}: expected ${[...known].join(" or ")}.`);
    }
    for (const kind of TIER_LIST_KINDS) {
      if (names.includes(TIER_LIST_FILES[kind])) {
        files.push({ file: `${CURATED_DIR}/${dir.name}/${TIER_LIST_FILES[kind]}`, setId: Number(dir.name), kind });
      }
    }
  }
  return files;
}

async function loadReferences() {
  const db = getSupabaseAdmin();
  const [sets, champions, items] = await Promise.all([
    selectAll((from, to) => db.from("tft_sets").select("id").order("id").range(from, to), "tft_sets"),
    selectAll(
      (from, to) => db.from("champions").select("api_name, name, set_id").order("api_name").range(from, to),
      "champions",
    ),
    selectAll((from, to) => db.from("items").select("api_name, name").order("api_name").range(from, to), "items"),
  ]);
  const index: ReferenceIndex = {
    champions: new Map(champions.map((c) => [c.api_name, { name: c.name, setId: c.set_id }])),
    items: new Map(items.map((i) => [i.api_name, { name: i.name }])),
  };
  return { setIds: new Set(sets.map((s) => s.id)), index };
}

async function writeTierList(list: SeedTierList) {
  const db = getSupabaseAdmin();
  const { id } = must(
    await db
      .from("tier_lists")
      .upsert(
        {
          slug: list.slug,
          kind: list.kind,
          set_id: list.setId,
          patch: list.patch,
          title: list.title,
          notes: list.summary,
          // Lists becoming current are switched over together at the end (one per kind).
          ...(list.isCurrent ? {} : { is_current: false }),
        },
        { onConflict: "slug" },
      )
      .select("id")
      .single(),
    `tier_lists ${list.slug}`,
  );

  const column = list.kind === "champion" ? "champion_api_name" : "item_api_name";
  const rows = list.entries.map((entry) => ({
    tier_list_id: id,
    tier: entry.tier,
    position: entry.position,
    note: entry.note,
    champion_api_name: list.kind === "champion" ? entry.apiName : null,
    item_api_name: list.kind === "item" ? entry.apiName : null,
  }));
  must(await db.from("tier_entries").upsert(rows, { onConflict: `tier_list_id,${column}` }), `${list.slug} entries`);

  const listed = new Set(list.entries.map((entry) => entry.apiName));
  const existing = must(
    await db.from("tier_entries").select("id, champion_api_name, item_api_name").eq("tier_list_id", id),
    `${list.slug} entries`,
  );
  const removed = existing
    .filter((row) => !listed.has((row.champion_api_name ?? row.item_api_name)!))
    .map((row) => row.id);
  for (const batch of chunks(removed, 100)) {
    must(await db.from("tier_entries").delete().in("id", batch), `${list.slug} entries`);
  }
  return removed.length;
}

async function makeCurrent(list: SeedTierList) {
  const db = getSupabaseAdmin();
  must(
    await db.from("tier_lists").update({ is_current: false }).eq("kind", list.kind).eq("is_current", true).neq("slug", list.slug),
    `tier_lists ${list.kind}`,
  );
  must(await db.from("tier_lists").update({ is_current: true }).eq("slug", list.slug), `tier_lists ${list.slug}`);
}

async function main() {
  const { values } = parseArgs({ options: { "dry-run": { type: "boolean", default: false } } });

  const files = await findTierFiles();
  if (files.length === 0) {
    console.log(`No tier lists found. Add ${CURATED_DIR}/<set>/${TIER_LIST_FILES.champion} to seed one.`);
    return;
  }

  const { setIds, index } = await loadReferences();
  const issues: SeedIssue[] = [];
  const lists: SeedTierList[] = [];
  for (const { file, setId, kind } of files) {
    if (!setIds.has(setId)) {
      issues.push({ file, path: "", message: `set ${setId} has no static data yet; run pnpm sync:static --set ${setId}` });
      continue;
    }
    const result = validateTierList({ file, text: await readFile(file, "utf8"), setId, kind, index });
    issues.push(...result.issues);
    if (result.list) lists.push(result.list);
  }
  issues.push(...checkTierListSet(lists));

  if (issues.length) {
    console.error(`${issues.length} problem${issues.length === 1 ? "" : "s"}; nothing was written:\n`);
    for (const issue of issues) console.error(`  ${formatIssue(issue)}`);
    process.exitCode = 1;
    return;
  }

  for (const list of lists) {
    const current = list.isCurrent ? " (current)" : "";
    console.log(`${list.file}: ${list.slug}${current}, ${list.entries.length} entries`);
  }
  if (values["dry-run"]) {
    console.log("\nDry run: all files valid, nothing written.");
    return;
  }

  for (const list of lists) {
    const removed = await writeTierList(list);
    if (removed) console.log(`  ${list.slug}: removed ${removed} entries no longer in the file`);
  }
  for (const list of lists.filter((l) => l.isCurrent)) await makeCurrent(list);
  console.log(`\nSeeded ${lists.length} tier list${lists.length === 1 ? "" : "s"}.`);
  await revalidateSite(["tiers"]);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
