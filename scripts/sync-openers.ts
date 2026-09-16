/**
 * Meta comps → data/curated/<setId>/openers.yaml.
 *
 *   pnpm sync:openers                  cluster early units, derive, validate, overwrite openers.yaml
 *   pnpm sync:openers --dry-run        everything but the write, and print what would change
 *   pnpm sync:openers --set 18
 *   pnpm sync:openers --max-openers 8
 *
 * Derives stage-2 opener boards from MetaTFT comp clusters (architecture §7, §8):
 * - Clusters active published comps by early units (1- and 2-costs)
 * - Assigns opener tiers (S/A/B) based on comp strength and pick rate
 * - Computes shared trait names for boards (e.g. "Blossom Invokers")
 * - Determines top universal completed slammable items
 * - Resolves valid transition comp slugs
 * - Generates concise play advice (≤96 chars)
 * - Validates schema and entity references before writing
 */
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import {
  buildOpenersYaml,
  deriveOpeners,
  type OpenerCompData,
  type OpenerReferenceData,
} from "@/lib/curated/openers-sync";
import { validateOpeners, type OpenerCarry } from "@/lib/curated/opener-validation";
import { COMPS_DIR, OPENERS_FILE, compFileSchema } from "@/lib/curated/schemas";
import { formatIssue, parseYaml } from "@/lib/curated/validate";
import type { NameBook } from "@/lib/static/names";
import type { TierRank } from "@/lib/static/game";
import { loadReferences, type References } from "./lib/references";

const CURATED_DIR = "data/curated";
const DEFAULT_MAX_OPENERS = 8;

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

async function main() {
  const { values } = parseArgs({
    options: {
      "dry-run": { type: "boolean", default: false },
      set: { type: "string" },
      "max-openers": { type: "string", default: String(DEFAULT_MAX_OPENERS) },
    },
  });

  const maxOpeners = Number(values["max-openers"]);
  if (!Number.isInteger(maxOpeners) || maxOpeners < 1) {
    throw new Error(`--max-openers expects a positive whole number, got "${values["max-openers"]}"`);
  }

  const refs: References = await loadReferences();

  const setId = values.set ? Number(values.set) : Math.max(...refs.setIds);
  if (!refs.setIds.has(setId)) {
    throw new Error(`Set ${setId} has no static data. Known sets: ${[...refs.setIds].sort().join(", ")}`);
  }

  const compsDir = `${CURATED_DIR}/${setId}/${COMPS_DIR}`;
  if (!existsSync(compsDir)) {
    throw new Error(`Comps directory does not exist: ${compsDir}`);
  }

  const filenames = (await readdir(compsDir)).sort();
  const compFiles = filenames.filter((f) => /\.ya?ml$/.test(f));

  console.log(`Loaded ${plural(compFiles.length, "comp file")} from ${compsDir}.`);

  const compDataList: OpenerCompData[] = [];
  const rawComps: {
    slug: string;
    name: string;
    tier: TierRank;
    patch: string;
    board: { unit: string; carry?: boolean; priority?: number; items?: string[] }[];
  }[] = [];

  for (const filename of compFiles) {
    const filePath = `${compsDir}/${filename}`;
    const text = await readFile(filePath, "utf8");
    const yaml = parseYaml(filePath, text);
    if (yaml.syntaxIssues.length) {
      console.warn(`Skipping ${filename} due to syntax error: ${yaml.syntaxIssues[0]!.message}`);
      continue;
    }

    const parsed = compFileSchema.safeParse(yaml.data);
    if (!parsed.success) {
      console.warn(`Skipping ${filename}: does not match comp schema (${parsed.error.issues[0]!.message})`);
      continue;
    }

    const comp = parsed.data;
    if (comp.published === false) continue;

    rawComps.push({
      slug: comp.slug,
      name: comp.name,
      tier: comp.tier,
      patch: comp.patch,
      board: comp.board,
    });

    const carries = comp.board
      .filter((u) => u.carry)
      .map((u) => ({
        apiName: u.unit,
        priority: u.priority,
        items: u.items ?? [],
      }));

    compDataList.push({
      slug: comp.slug,
      name: comp.name,
      tier: comp.tier,
      pickRate: comp.pick_rate,
      avgPlace: comp.avg_place,
      earlyUnits: comp.early_units ?? [],
      carries,
    });
  }

  const patch = rawComps.find((c) => c.patch)?.patch ?? refs.setPatches.get(setId) ?? "18.2";

  // Build reference maps for derivation
  const openerRefData: OpenerReferenceData = {
    championNames: new Map(
      Array.from(refs.index.champions.entries()).map(([apiName, c]) => [apiName, c.name]),
    ),
    championCosts: refs.costs,
    championTraits: new Map(
      Array.from(refs.index.champions.entries()).map(([apiName, c]) => [apiName, c.traits]),
    ),
    traitNames: new Map(
      Array.from(refs.index.traits.entries()).map(([apiName, t]) => [apiName, t.name]),
    ),
    itemNames: new Map(
      Array.from(refs.index.items.entries()).map(([apiName, i]) => [apiName, i.name]),
    ),
    itemKinds: refs.itemKinds,
  };

  const openers = deriveOpeners(compDataList, openerRefData, patch, maxOpeners);
  console.log(`Derived ${plural(openers.length, "opener board")}:`);

  for (const opener of openers) {
    const unitNames = opener.units.map((u) => u.name).join(", ");
    const itemNames = opener.items.map((i) => i.name).join(", ");
    const pivotSlugs = opener.pivots.map((p) => p.slug).join(", ");
    console.log(`  [${opener.tier}] ${opener.name}`);
    console.log(`      Units: ${unitNames}`);
    console.log(`      Items: ${itemNames}`);
    console.log(`      Pivots: ${pivotSlugs}`);
    console.log(`      Notes: "${opener.notes}"`);
  }

  const generatedYaml = buildOpenersYaml({ patch, openers });

  // Validate against reference tables & comp slugs before writing
  const names: NameBook = {
    champions: Object.fromEntries(
      Array.from(refs.index.champions.entries()).map(([apiName, c]) => [
        apiName,
        { name: c.name, cost: refs.costs.get(apiName) ?? 0, iconUrl: null },
      ]),
    ),
    items: Object.fromEntries(
      Array.from(refs.index.items.entries()).map(([apiName, i]) => [
        apiName,
        { name: i.name, iconUrl: null },
      ]),
    ),
    traits: Object.fromEntries(
      Array.from(refs.index.traits.entries()).map(([apiName, t]) => [
        apiName,
        { name: t.name, iconUrl: null },
      ]),
    ),
  };

  const compRefs = new Map<string, { name: string; tier: TierRank; carry?: OpenerCarry }>();
  for (const comp of rawComps) {
    const mainCarry = comp.board.find((u) => u.carry) ?? comp.board[0];
    const carryName = mainCarry ? (refs.index.champions.get(mainCarry.unit)?.name ?? mainCarry.unit) : undefined;
    const carryCost = mainCarry ? (refs.costs.get(mainCarry.unit) ?? 0) : 0;
    compRefs.set(comp.slug, {
      name: comp.name,
      tier: comp.tier,
      carry: carryName ? { name: carryName, cost: carryCost, iconUrl: null } : undefined,
    });
  }

  const targetFile = `${CURATED_DIR}/${setId}/${OPENERS_FILE}`;
  const validation = validateOpeners({
    file: targetFile,
    text: generatedYaml,
    refs: { names, comps: compRefs },
  });

  if (validation.issues.length) {
    console.error(`\nThe generated ${targetFile} failed validation:`);
    for (const issue of validation.issues) {
      console.error(`  ${formatIssue(issue)}`);
    }
    process.exitCode = 1;
    return;
  }

  if (validation.warnings.length) {
    console.warn(`\nWarnings for ${targetFile}:`);
    for (const warning of validation.warnings) {
      console.warn(`  ${formatIssue(warning)}`);
    }
  }

  if (values["dry-run"]) {
    console.log(`\n--dry-run: ${targetFile} not written.`);
    return;
  }

  await mkdir(dirname(targetFile), { recursive: true });
  await writeFile(targetFile, generatedYaml, "utf8");
  console.log(`\nWrote ${targetFile} successfully.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
