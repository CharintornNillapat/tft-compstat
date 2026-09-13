/**
 * Curated YAML → tier_lists + tier_entries, comps + comp_units (architecture §7),
 * then revalidates the site's "tiers" and "comps" cache tags.
 *
 *   pnpm seed:curated            validate every file, then write
 *   pnpm seed:curated --dry-run  validate only
 *
 * Reads data/curated/<setId>/{champion,item}-tiers.yaml and
 * data/curated/<setId>/comps/<slug>.yaml. Every file is validated against the
 * static tables before anything is written; any issue aborts the run.
 *
 * supabase-js has no transactions, so each tier list is written as single-statement
 * steps that never leave it empty: upsert the list, upsert its entries, prune
 * entries that left the file. Each comp is written by the seed_comp RPC in one
 * transaction. Comps whose file was removed are unpublished, not deleted. Re-running
 * fixes a failed run, and pages keep their cached copy until the final revalidation.
 */
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import type { CacheTag } from "@/lib/cache-tags";
import {
  AUGMENT_TIERS_FILE,
  CHAMPION_BIS_FILE,
  COMPS_DIR,
  META_NOTES_FILE,
  OPENERS_FILE,
  TIER_LIST_FILES,
  TIER_LIST_KINDS,
  type TierListKind,
} from "@/lib/curated/schemas";
import {
  checkCompSet,
  checkTierListSet,
  formatIssue,
  validateComp,
  validateTierList,
  type SeedComp,
  type SeedIssue,
  type SeedTierList,
} from "@/lib/curated/validate";
import { COMP_STYLE_LABELS } from "@/lib/static/game";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { chunks, must } from "./lib/db";
import { loadReferences } from "./lib/references";
import { revalidateSite } from "./lib/revalidate";

const CURATED_DIR = "data/curated";

type TierFile = { file: string; setId: number; kind: TierListKind };
type CompFile = { file: string; setId: number };

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** Gem flag and curated stats in the run summary, so a seed shows what it stored. */
function compExtras(comp: SeedComp): string {
  const pct = (fraction: number | null) => (fraction === null ? null : `${(fraction * 100).toFixed(1)}%`);
  const parts = [
    comp.isGem ? "gem" : null,
    comp.avgPlace === null ? null : `avg ${comp.avgPlace.toFixed(2)}`,
    pct(comp.top4Rate) && `top4 ${pct(comp.top4Rate)}`,
    pct(comp.pickRate) && `pick ${pct(comp.pickRate)}`,
    comp.levelRecommended === null ? null : `lv ${comp.levelRecommended}`,
  ].filter(Boolean);
  return parts.length ? `, ${parts.join(", ")}` : "";
}

async function findCuratedFiles(): Promise<{ tierFiles: TierFile[]; compFiles: CompFile[] }> {
  const tierFiles: TierFile[] = [];
  const compFiles: CompFile[] = [];
  if (!existsSync(CURATED_DIR)) return { tierFiles, compFiles };

  // meta-notes.yaml, openers.yaml, champion-bis.yaml and augment-tiers.yaml are curated too, but the
  // site reads them straight from the repo at build time (src/lib/curated/{meta-brief,openers,bis,augments}.ts).
  // They are known here only so they don't warn.
  const known = new Set([...Object.values(TIER_LIST_FILES), META_NOTES_FILE, OPENERS_FILE, CHAMPION_BIS_FILE, AUGMENT_TIERS_FILE]);
  const expected = `${[...known].join(", ")} or ${COMPS_DIR}/<slug>.yaml`;
  for (const dir of await readdir(CURATED_DIR, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    if (!/^\d+$/.test(dir.name)) {
      console.warn(`Skipping ${CURATED_DIR}/${dir.name}: folders are named by set number, e.g. ${CURATED_DIR}/18.`);
      continue;
    }
    const setDir = `${CURATED_DIR}/${dir.name}`;
    const setId = Number(dir.name);
    const names = await readdir(setDir);
    for (const name of names.filter((n) => /\.ya?ml$/.test(n) && !known.has(n))) {
      console.warn(`Skipping ${setDir}/${name}: expected ${expected}.`);
    }
    for (const kind of TIER_LIST_KINDS) {
      if (names.includes(TIER_LIST_FILES[kind])) {
        tierFiles.push({ file: `${setDir}/${TIER_LIST_FILES[kind]}`, setId, kind });
      }
    }
    if (names.includes(COMPS_DIR)) {
      for (const name of (await readdir(`${setDir}/${COMPS_DIR}`)).sort()) {
        if (/\.ya?ml$/.test(name)) compFiles.push({ file: `${setDir}/${COMPS_DIR}/${name}`, setId });
        else console.warn(`Skipping ${setDir}/${COMPS_DIR}/${name}: comps are <slug>.yaml files.`);
      }
    }
  }
  return { tierFiles, compFiles };
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

/** Upserts the comp by slug and replaces its units, in one transaction (seed_comp RPC). */
async function writeComp(comp: SeedComp) {
  const db = getSupabaseAdmin();
  must(
    await db.rpc("seed_comp", {
      p_comp: {
        slug: comp.slug,
        set_id: comp.setId,
        patch: comp.patch,
        name: comp.name,
        tier: comp.tier,
        style: comp.style,
        difficulty: comp.difficulty,
        summary: comp.summary,
        guide_md: comp.guide,
        early_units: comp.earlyUnits,
        flex_units: comp.flexUnits,
        is_published: comp.isPublished,
        sort_order: comp.sortOrder,
        is_gem: comp.isGem,
        avg_place: comp.avgPlace,
        top4_rate: comp.top4Rate,
        pick_rate: comp.pickRate,
        level_recommended: comp.levelRecommended,
      },
      p_units: comp.units.map((unit) => ({
        champion_api_name: unit.apiName,
        hex_row: unit.row,
        hex_col: unit.col,
        star_goal: unit.star,
        is_carry: unit.isCarry,
        items: unit.items,
        carry_priority: unit.carryPriority,
      })),
    }),
    `comps ${comp.slug}`,
  );
}

/** Unpublishes comps whose YAML is gone; their rows stay as history. Returns their slugs. */
async function unpublishRemovedComps(keep: readonly SeedComp[]) {
  const db = getSupabaseAdmin();
  let query = db.from("comps").update({ is_published: false }).eq("is_published", true);
  // Slugs are validated as [a-z0-9-], so they need no quoting in the filter.
  if (keep.length) query = query.not("slug", "in", `(${keep.map((comp) => comp.slug).join(",")})`);
  return must(await query.select("slug"), "comps").map((row) => row.slug);
}

async function main() {
  const { values } = parseArgs({ options: { "dry-run": { type: "boolean", default: false } } });

  const { tierFiles, compFiles } = await findCuratedFiles();
  if (tierFiles.length === 0 && compFiles.length === 0) {
    console.log(
      `No curated files found. Add ${CURATED_DIR}/<set>/${TIER_LIST_FILES.champion} or ` +
        `${CURATED_DIR}/<set>/${COMPS_DIR}/<slug>.yaml to seed one.`,
    );
    return;
  }

  const { setIds, index } = await loadReferences();
  const issues: SeedIssue[] = [];
  const missingSet = (file: string, setId: number) => {
    if (setIds.has(setId)) return false;
    issues.push({ file, path: "", message: `set ${setId} has no static data yet; run pnpm sync:static --set ${setId}` });
    return true;
  };

  const lists: SeedTierList[] = [];
  for (const { file, setId, kind } of tierFiles) {
    if (missingSet(file, setId)) continue;
    const result = validateTierList({ file, text: await readFile(file, "utf8"), setId, kind, index });
    issues.push(...result.issues);
    if (result.list) lists.push(result.list);
  }
  issues.push(...checkTierListSet(lists));

  const comps: SeedComp[] = [];
  for (const { file, setId } of compFiles) {
    if (missingSet(file, setId)) continue;
    const result = validateComp({ file, text: await readFile(file, "utf8"), setId, index });
    issues.push(...result.issues);
    if (result.comp) comps.push(result.comp);
  }
  issues.push(...checkCompSet(comps));

  if (issues.length) {
    console.error(`${plural(issues.length, "problem")}; nothing was written:\n`);
    for (const issue of issues) console.error(`  ${formatIssue(issue)}`);
    process.exitCode = 1;
    return;
  }

  for (const list of lists) {
    const current = list.isCurrent ? " (current)" : "";
    console.log(`${list.file}: ${list.slug}${current}, ${list.entries.length} entries`);
  }
  for (const comp of comps) {
    const hidden = comp.isPublished ? "" : ", unpublished";
    console.log(
      `${comp.file}: ${comp.tier} ${COMP_STYLE_LABELS[comp.style]}, ${plural(comp.units.length, "unit")}${compExtras(comp)}${hidden}`,
    );
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
  for (const comp of comps) await writeComp(comp);
  const unpublished = await unpublishRemovedComps(comps);
  if (unpublished.length) console.log(`  Unpublished comps whose file was removed: ${unpublished.join(", ")}`);

  console.log(`\nSeeded ${plural(lists.length, "tier list")} and ${plural(comps.length, "comp")}.`);
  const tags: CacheTag[] = [];
  if (lists.length) tags.push("tiers");
  if (comps.length || unpublished.length) tags.push("comps");
  if (tags.length) await revalidateSite(tags);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
