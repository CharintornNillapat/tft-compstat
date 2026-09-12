/**
 * MetaTFT ranked stats → data/curated/<setId>/{champion,item}-tiers.yaml.
 *
 *   pnpm sync:meta                     fetch, rate, validate, overwrite both files
 *   pnpm sync:meta --dry-run           everything but the write, and print what would change
 *   pnpm sync:meta --seed              write, then run `pnpm seed:curated`
 *   pnpm sync:meta --rank CHALLENGER --days 7 --min-games 2000
 *   pnpm sync:meta --item-kinds completed,emblem,artifact,radiant
 *
 * The feed reports `api_name`s and an eight-bucket placement histogram, so average
 * placement is computed rather than scraped and no display-name lookup is needed in
 * the happy path. Names are still resolved against `champions` / `items` before
 * anything is written: an unknown name is reported and skipped, and a near miss
 * (the feed changing case or an underscore) is matched through the same
 * `suggestApiNames` the seed's "Did you mean …?" uses, so it never reaches the file.
 *
 * The generated files are validated by `validateTierList` — the very code
 * `pnpm seed:curated` runs — before they are written. Anything it rejects aborts
 * the sync with the file, line and column, and both files are left alone.
 *
 * Rating a unit by the average placement of the boards it appeared on is a rough
 * proxy for its strength; `src/lib/curated/meta-sync.ts` says where that breaks
 * down. Read the result before trusting it, and keep judgement in `notes:`, which
 * a sync carries over.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import {
  buildTierListYaml,
  describeBandEdges,
  describeBands,
  diffTiers,
  groupByTier,
  rankRows,
  readExistingTierList,
  tierListFingerprint,
  type MetaRow,
  type RankedEntry,
  type TierChange,
  type ThinRow,
} from "@/lib/curated/meta-sync";
import { TIER_LIST_FILES, type TierListKind } from "@/lib/curated/schemas";
import { formatIssue, suggestApiNames, validateTierList, type SeedIssue } from "@/lib/curated/validate";
import { ITEM_KINDS, TIER_RANKS } from "@/lib/static/game";
import { loadReferences, type References } from "./lib/references";

const CURATED_DIR = "data/curated";
const META_ORIGIN = "https://api-hc.metatft.com/tft-stat-api";
const SOURCE_NAME = "MetaTFT";

/** Ranked TFT. The feed keys its stats by queue, and this is the only one we rate from. */
const RANKED_QUEUE = "1100";

/** The bracket a tier list is meant to describe: where the meta is actually solved. */
const DEFAULT_RANKS = "DIAMOND,MASTER,GRANDMASTER,CHALLENGER";

/**
 * Components and consumables have an average placement but are not tier-list
 * material, and radiants split every item into a thin second sample. Override
 * with `--item-kinds` to rate them anyway.
 */
const DEFAULT_ITEM_KINDS = "completed,emblem,artifact";

/**
 * Enough games for the average to mean something. The live feed's thinnest
 * completed item sits in the thousands, so this only bites early in a patch.
 */
const DEFAULT_MIN_GAMES = 500;

/** Placements run 1st–8th; anything else means the feed changed shape. */
const placements = z
  .array(z.number().int().nonnegative())
  .length(8, "must be 8 placement counts, one per finishing position");

const feedMeta = {
  /**
   * One row per patch in the window; the first is the one being reported. Allowed to
   * be empty here so that an unknown rank or queue — which the feed answers with an
   * empty result rather than an error — gets the pointed message below, not a schema one.
   */
  games: z.array(z.object({ patch: z.string(), count: z.number() })),
  tft_set: z.string(),
  /** Epoch milliseconds. */
  updated: z.number(),
};

const unitFeedSchema = z.object({ results: z.array(z.object({ unit: z.string(), places: placements })), ...feedMeta });
const itemFeedSchema = z.object({
  results: z.array(z.object({ itemName: z.string(), places: placements })),
  ...feedMeta,
});

type Feed = { rows: MetaRow[]; patch: string; games: number; setId: number; updated: Date };

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
const num = (value: number) => value.toLocaleString("en-US");

async function getJson(url: URL): Promise<unknown> {
  const response = await fetch(url, {
    // Identify the caller rather than pretending to be a browser: this is a
    // handful of requests against a public endpoint, run by hand.
    headers: { accept: "application/json", "user-agent": "tft-compstat/0.1 (pnpm sync:meta)" },
  });
  if (!response.ok) throw new Error(`GET ${url.href} failed: ${response.status} ${response.statusText}`);
  return response.json();
}

/** `TFTSet18` → 18. The feed labels the set it is reporting, and we refuse to guess. */
function parseFeedSet(label: string): number {
  const match = /^TFTSet(\d+)$/.exec(label);
  if (!match) throw new Error(`${SOURCE_NAME} reported the set as "${label}", which this script can't read.`);
  return Number(match[1]);
}

async function fetchFeed(kind: TierListKind, query: Record<string, string>): Promise<Feed> {
  const url = new URL(`${META_ORIGIN}/${kind === "champion" ? "units" : "items"}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);

  const json = await getJson(url);
  const parsed = kind === "champion" ? unitFeedSchema.safeParse(json) : itemFeedSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `${SOURCE_NAME} ${kind} stats did not match the expected shape (the feed may have changed):\n` +
        parsed.error.issues.map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`).join("\n"),
    );
  }
  const feed = parsed.data;
  const rows: MetaRow[] = feed.results.map((row) =>
    "unit" in row ? { apiName: row.unit, places: row.places } : { apiName: row.itemName, places: row.places },
  );
  const first = feed.games[0];
  if (rows.length === 0 || first === undefined) {
    throw new Error(
      `${SOURCE_NAME} returned no ${kind} stats for ${url.search}.\n` +
        "  An unknown rank or queue answers with an empty result rather than an error, " +
        "so check --rank and --days first.",
    );
  }

  return {
    rows,
    patch: first.patch,
    games: first.count,
    setId: parseFeedSet(feed.tft_set),
    updated: new Date(feed.updated),
  };
}

type Resolution = {
  rows: MetaRow[];
  /** Feed name → api name, where the two differed. Printed so a rename is visible. */
  corrected: { from: string; to: string }[];
  /** Feed rows with no match in the static tables. */
  unknown: string[];
  /** Rows that resolved but are deliberately not rated (wrong set, summon, wrong kind). */
  excluded: number;
};

/**
 * Feed names → `api_name`s, dropping anything a tier list has no business listing.
 * Exact match first; otherwise `suggestApiNames` is trusted only when it returns a
 * single candidate, so an ambiguous near miss is reported rather than guessed at.
 */
function resolveRows(
  rows: readonly MetaRow[],
  candidates: ReadonlyMap<string, { name: string }>,
  keep: (apiName: string) => boolean,
): Resolution {
  const resolved: MetaRow[] = [];
  const corrected: Resolution["corrected"] = [];
  const unknown: string[] = [];
  let excluded = 0;

  for (const row of rows) {
    let apiName = row.apiName;
    if (!candidates.has(apiName)) {
      const suggestions = suggestApiNames(apiName, candidates);
      if (suggestions.length !== 1) {
        unknown.push(apiName);
        continue;
      }
      apiName = suggestions[0]!;
      corrected.push({ from: row.apiName, to: apiName });
    }
    if (!keep(apiName)) {
      excluded++;
      continue;
    }
    resolved.push({ apiName, places: row.places });
  }
  return { rows: resolved, corrected, unknown, excluded };
}

type Plan = {
  kind: TierListKind;
  file: string;
  text: string;
  entries: RankedEntry[];
  thin: ThinRow[];
  resolution: Resolution;
  changes: TierChange[];
  /** True when the file on disk already says exactly this. */
  unchanged: boolean;
};

async function planTierList(input: {
  kind: TierListKind;
  setId: number;
  feed: Feed;
  bracket: string;
  days: string;
  minGames: number;
  candidates: ReadonlyMap<string, { name: string }>;
  keep: (apiName: string) => boolean;
}): Promise<Plan> {
  const { kind, setId, feed, minGames } = input;
  const file = `${CURATED_DIR}/${setId}/${TIER_LIST_FILES[kind]}`;
  const before = existsSync(file) ? await readFile(file, "utf8") : undefined;
  const existing = before === undefined ? undefined : readExistingTierList(before);

  const resolution = resolveRows(feed.rows, input.candidates, input.keep);
  const { entries, thin } = rankRows(resolution.rows, minGames);
  const tiers = groupByTier(entries);
  // A file that was not the site's current list stays that way; a new one becomes it.
  const current = existing?.current ?? true;
  const notes = existing?.notes ?? {};

  const window = `last ${plural(Number(input.days), "day")}`;
  const summary =
    `${SOURCE_NAME} ${input.bracket} ranked averages, patch ${feed.patch}: ` +
    `${num(feed.games)} games over the ${window}.`;
  const text = buildTierListYaml({
    kind,
    patch: feed.patch,
    current,
    entries,
    notes,
    summary,
    provenance: [
      `Source: ${SOURCE_NAME} ${META_ORIGIN}, ranked queue ${RANKED_QUEUE}, ${input.bracket}, ${window}.`,
      `Sample: ${num(feed.games)} games on patch ${feed.patch}, set ${setId}. ` +
        `Feed updated ${feed.updated.toISOString()}.`,
      `Tiers are percentile bands of the ranking: ${describeBands()}. A tier is therefore relative to this list.`,
      `Where they fell, as size and worst average placement: ${describeBandEdges(entries)}.`,
      `Within a tier, entries run best average placement first. Rated with at least ${num(minGames)} games.`,
    ],
  });

  return {
    kind,
    file,
    text,
    entries,
    thin,
    resolution,
    changes: diffTiers(existing?.tiers ?? {}, tiers),
    // Not a text comparison: the sample size in the header grows between any two
    // runs, so that would rewrite the file every sync. See tierListFingerprint.
    unchanged:
      existing !== undefined &&
      tierListFingerprint({ patch: existing.patch, current: existing.current, tiers: existing.tiers, notes }) ===
        tierListFingerprint({ patch: feed.patch, current, tiers, notes }),
  };
}

function reportPlan(plan: Plan, index: References["index"]) {
  const names = plan.kind === "champion" ? index.champions : index.items;
  // Set 18 has two Flora Fatalis emblems and eight Lux variants, so a display name
  // alone can name two different rows. Add the api name only where it has to.
  const seen = new Map<string, number>();
  for (const entry of plan.entries) {
    const name = names.get(entry.apiName)?.name ?? entry.apiName;
    seen.set(name, (seen.get(name) ?? 0) + 1);
  }
  const display = (apiName: string) => {
    const name = names.get(apiName)?.name;
    if (name === undefined) return apiName;
    return (seen.get(name) ?? 0) > 1 ? `${name} (${apiName})` : name;
  };
  const grouped = groupByTier(plan.entries);

  console.log(`\n${plan.file}`);
  const spread = TIER_RANKS.map((tier) => `${tier} ${grouped[tier]?.length ?? 0}`).join(" · ");
  console.log(`  rated ${plan.entries.length} of ${plan.resolution.rows.length} eligible rows  (${spread})`);
  for (const tier of TIER_RANKS) {
    const inTier = plan.entries.filter((entry) => entry.tier === tier);
    if (!inTier.length) continue;
    const shown = inTier.slice(0, 8).map((entry) => `${display(entry.apiName)} ${entry.avgPlace.toFixed(2)}`);
    const rest = inTier.length > shown.length ? ` … +${inTier.length - shown.length}` : "";
    console.log(`    ${tier}: ${shown.join(", ")}${rest}`);
  }

  for (const { from, to } of plan.resolution.corrected) {
    console.log(`  resolved "${from}" to ${to} (${display(to)})`);
  }
  if (plan.resolution.unknown.length) {
    console.log(
      `  skipped ${plural(plan.resolution.unknown.length, "unknown name")}: ${plan.resolution.unknown.join(", ")}` +
        "\n    Not in the static tables. Run pnpm sync:static if the patch added them.",
    );
  }
  if (plan.thin.length) {
    console.log(`  skipped ${plural(plan.thin.length, "thin sample")}: ${plan.thin
      .slice(0, 6)
      .map((row) => `${display(row.apiName)} (${num(row.games)})`)
      .join(", ")}`);
  }

  if (plan.unchanged) {
    console.log("  no change: the file already says exactly this");
    return;
  }
  if (!plan.changes.length) {
    // The tiers hold the same entries, but two of them swapped places inside one.
    // That is the display order, so it is a real change, just a quiet one.
    console.log("  same entries in the same tiers; only the order within a tier moved");
    return;
  }
  const label = { added: "+", removed: "-", moved: "~" } as const;
  console.log(`  ${plural(plan.changes.length, "change")}:`);
  for (const change of plan.changes) {
    const where =
      change.change === "added"
        ? `→ ${change.to}`
        : change.change === "removed"
          ? `was ${change.from}`
          : `${change.from} → ${change.to}`;
    console.log(`    ${label[change.change]} ${display(change.apiName)} ${where}`);
  }
}

/** The same check `pnpm seed:curated` runs, against text that is still in memory. */
function validatePlans(plans: readonly Plan[], setId: number, references: References): SeedIssue[] {
  return plans.flatMap(
    (plan) => validateTierList({ file: plan.file, text: plan.text, setId, kind: plan.kind, index: references.index }).issues,
  );
}

function runSeed(): void {
  console.log("\n$ pnpm seed:curated");
  // A shell, because pnpm is a .cmd shim on Windows. One fixed command string rather
  // than an args array: with `shell: true` Node only concatenates args, and warns
  // (DEP0190) because that would be an injection point for anything interpolated.
  const result = spawnSync("pnpm seed:curated", { stdio: "inherit", shell: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`pnpm seed:curated exited with ${result.status}`);
}

function parseItemKinds(input: string): Set<string> {
  const kinds = input
    .split(",")
    .map((kind) => kind.trim())
    .filter(Boolean);
  const unknown = kinds.filter((kind) => !(ITEM_KINDS as readonly string[]).includes(kind));
  if (unknown.length) {
    throw new Error(
      `--item-kinds does not know ${unknown.join(", ")}; use any of ${ITEM_KINDS.join(", ")}`,
    );
  }
  if (!kinds.length) throw new Error("--item-kinds needs at least one kind");
  return new Set(kinds);
}

async function main() {
  const { values } = parseArgs({
    options: {
      "dry-run": { type: "boolean", default: false },
      seed: { type: "boolean", default: false },
      set: { type: "string" },
      rank: { type: "string", default: DEFAULT_RANKS },
      days: { type: "string", default: "3" },
      "min-games": { type: "string", default: String(DEFAULT_MIN_GAMES) },
      "item-kinds": { type: "string", default: DEFAULT_ITEM_KINDS },
    },
  });

  const minGames = Number(values["min-games"]);
  if (!Number.isInteger(minGames) || minGames < 0) {
    throw new Error(`--min-games expects a whole number, got "${values["min-games"]}"`);
  }
  if (!/^\d+$/.test(values.days)) throw new Error(`--days expects a whole number, got "${values.days}"`);
  const itemKinds = parseItemKinds(values["item-kinds"]);
  const bracket = values.rank.split(",").length > 1 ? `${values.rank.split(",")[0]}+` : values.rank;

  const query = { queue: RANKED_QUEUE, patch: "current", rank: values.rank, days: values.days };
  console.log(`${SOURCE_NAME} ranked ${bracket}, last ${plural(Number(values.days), "day")}…`);
  const [championFeed, itemFeed] = await Promise.all([fetchFeed("champion", query), fetchFeed("item", query)]);

  if (championFeed.setId !== itemFeed.setId || championFeed.patch !== itemFeed.patch) {
    throw new Error(
      `The two feeds disagree: champions are set ${championFeed.setId} patch ${championFeed.patch}, ` +
        `items are set ${itemFeed.setId} patch ${itemFeed.patch}. Retry in a moment.`,
    );
  }
  const setId = championFeed.setId;
  if (values.set !== undefined && Number(values.set) !== setId) {
    throw new Error(`--set ${values.set} was asked for, but ${SOURCE_NAME} is reporting set ${setId}.`);
  }

  const references = await loadReferences();
  if (!references.setIds.has(setId)) {
    throw new Error(`Set ${setId} has no static data yet; run pnpm sync:static --set ${setId} first.`);
  }
  console.log(
    `Set ${setId}, patch ${championFeed.patch}: ${num(championFeed.games)} games, ` +
      `${championFeed.rows.length} unit and ${itemFeed.rows.length} item rows.`,
  );

  const plans = await Promise.all([
    planTierList({
      kind: "champion",
      setId,
      feed: championFeed,
      bracket,
      days: values.days,
      minGames,
      candidates: references.index.champions,
      // Summons are rated by the feed but are not in the shop, so they belong on no list.
      keep: (apiName) =>
        references.index.champions.get(apiName)?.setId === setId && references.shopUnits.has(apiName),
    }),
    planTierList({
      kind: "item",
      setId,
      feed: itemFeed,
      bracket,
      days: values.days,
      minGames,
      candidates: references.index.items,
      keep: (apiName) => itemKinds.has(references.itemKinds.get(apiName) ?? ""),
    }),
  ]);

  for (const plan of plans) reportPlan(plan, references.index);

  const issues = validatePlans(plans, setId, references);
  if (issues.length) {
    console.error(`\n${plural(issues.length, "problem")} in the generated files; nothing was written:\n`);
    for (const issue of issues) console.error(`  ${formatIssue(issue)}`);
    process.exitCode = 1;
    return;
  }

  if (values["dry-run"]) {
    console.log("\nDry run: both files valid, nothing written.");
    if (values.seed) console.log("--seed does nothing in a dry run; the files on disk did not change.");
    return;
  }

  const written = plans.filter((plan) => !plan.unchanged);
  for (const plan of written) {
    await mkdir(dirname(plan.file), { recursive: true });
    await writeFile(plan.file, plan.text, "utf8");
  }
  console.log(
    written.length
      ? `\nWrote ${written.map((plan) => plan.file).join(" and ")}.`
      : "\nBoth files were already up to date.",
  );

  if (values.seed) runSeed();
  else if (written.length) console.log("Run pnpm seed:curated to publish them (or pass --seed next time).");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
