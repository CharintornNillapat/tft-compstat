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
import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import {
  assignTiers,
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
import {
  assignCarries,
  buildCompYaml,
  compDifficulty,
  compFingerprint,
  compStyle,
  isGenerated,
  pickItems,
  placeUnits,
  slugify,
  type CompSource,
  type CompUnitInput,
  type PlacedUnit,
} from "@/lib/curated/comp-sync";
import { COMPS_DIR, TIER_LIST_FILES, type TierListKind } from "@/lib/curated/schemas";
import {
  checkCompSet,
  formatIssue,
  suggestApiNames,
  validateComp,
  validateTierList,
  type SeedComp,
  type SeedIssue,
} from "@/lib/curated/validate";
import { ITEM_KINDS, TIER_RANKS, type CompStyle, type TierRank } from "@/lib/static/game";
import {
  COMPS_ORIGIN,
  fetchClusterInfo,
  fetchCompDetails,
  fetchCompTotals,
  getJson,
  modal,
  parseFeedSet,
  rankStats,
  SOURCE_NAME,
  STAT_ORIGIN,
  type CompDetails,
} from "./lib/meta-feed";
import { loadReferences, type References } from "./lib/references";

const CURATED_DIR = "data/curated";

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

async function fetchFeed(kind: TierListKind, query: Record<string, string>): Promise<Feed> {
  const url = new URL(`${STAT_ORIGIN}/${kind === "champion" ? "units" : "items"}`);
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
      `Source: ${SOURCE_NAME} ${STAT_ORIGIN}, ranked queue ${RANKED_QUEUE}, ${input.bracket}, ${window}.`,
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

/* ------------------------------------------------------------------ comps (§7.2) */

/**
 * A comp's board is the `level` shop units it plays most, down to this share.
 *
 * The floor is low on purpose. A cluster is fuzzy — the same comp is played with
 * different last units — so demanding a unit be on *most* boards leaves a level-8 comp
 * with a five-unit board. The level decides the size; this only keeps noise out of the
 * last slot.
 */
const CORE_SHARE = 0.05;
/** Below the board, but played often enough to be worth naming as a swap. */
const FLEX_SHARE = 0.12;
/**
 * Under this many units we cannot describe the comp, so it is skipped and said so.
 * What this catches is a comp built around Riftbeasts and other summons (§11): the
 * feed rates them, they are most of the board, and none of them can be written down.
 */
const MIN_BOARD_UNITS = 6;

/**
 * Item kinds a comp may put on a unit. Real boards hold half-built components and the
 * odd consumable, and the feed reports them as builds; on a comp they read as advice
 * to leave a Recurve Bow on your carry, so they are not written.
 */
const COMP_ITEM_KINDS = new Set(["completed", "emblem", "artifact", "radiant"]);
const MAX_FLEX_UNITS = 4;
const MAX_EARLY_UNITS = 6;
/**
 * Enough to cover the meta rather than its top half. At 25 on patch 18.2 the last comp
 * picked still has ~7,000 Diamond+ boards and ~1% pick rate, so `--min-boards` is not
 * what bounds the list — this is.
 */
const DEFAULT_MAX_COMPS = 25;
/** Boards in the chosen bracket. Under this the board and the items are noise. */
const DEFAULT_MIN_COMP_BOARDS = 300;
/** Candidates fetched beyond `--max-comps`, since the bracket filter drops some. */
const CANDIDATE_MARGIN = 6;
/** How many comp_details requests are in flight at once against a public endpoint. */
const COMP_FETCH_CONCURRENCY = 4;

/**
 * `gem`: rare, and still finishing well. The rule you would want is "low pick rate,
 * high top-4 rate", but **the comps feed publishes no placement distribution** — only
 * a count and a mean — so top-4 rate cannot be derived. Average placement stands in
 * for it, and `top4_rate` is left out of the file rather than guessed.
 */
const GEM_MAX_PICK_RATE = 3;
const GEM_MAX_AVG_PLACE = 4.3;

type CompStats = { boards: number; avgPlace: number; pickRate: number };

type CompPlan = {
  slug: string;
  file: string;
  text: string;
  name: string;
  tier: TierRank;
  style: CompStyle;
  stats: CompStats;
  gem: boolean;
  units: number;
  /** What writing would do: a hand-written file is never touched. */
  status: "new" | "changed" | "unchanged" | "hand-written";
};

/** MetaTFT names a comp by its defining trait and carries; we show our own names. */
function compName(parts: readonly { name: string; type: string }[], references: References): string | undefined {
  const named = parts.flatMap((part) => {
    const name =
      part.type === "trait"
        ? references.index.traits.get(part.name)?.name
        : references.index.champions.get(part.name)?.name;
    return name ? [name] : [];
  });
  return named.length ? named.join(" ") : undefined;
}

/** "level 8 by 4-2" for each level worth waiting for, from the feed's own timings. */
function levelTimings(details: CompDetails, upTo: number): string[] {
  return details.levels
    .filter((row) => row.level >= 7 && row.level <= upTo && row.stage && row.round)
    .sort((a, b) => a.level - b.level)
    .map((row) => `level ${row.level} by ${row.stage}-${row.round}`);
}

/**
 * One comp, or undefined when the feed does not describe a board we can write.
 *
 * Everything here is the feed's own numbers: the board is the units that appeared on
 * most of the comp's boards, each on the hex it was played on most, at the star level
 * and with the item build it was played with most.
 */
function buildComp(input: {
  slug: string;
  name: string;
  details: CompDetails;
  stats: CompStats;
  tier: TierRank;
  order: number;
  patch: string;
  setId: number;
  bracket: string;
  references: References;
}): { source: CompSource; units: number } | undefined {
  const { details, stats, references, setId } = input;

  const isShopUnit = (apiName: string) =>
    references.index.champions.get(apiName)?.setId === setId && references.shopUnits.has(apiName);

  /**
   * A build worth writing: items we know, of a kind a comp should show, and no emblem
   * for a trait the unit already has — the last of which `validateComp` rejects.
   */
  const allowBuild = (apiName: string, items: readonly string[]) => {
    const held = new Set(references.index.champions.get(apiName)?.traits ?? []);
    for (const item of items) {
      const info = references.index.items.get(item);
      if (!info) return false;
      if (!COMP_ITEM_KINDS.has(references.itemKinds.get(item) ?? "")) return false;
      if (info.grantsTrait) {
        if (held.has(info.grantsTrait)) return false;
        held.add(info.grantsTrait);
      }
    }
    return true;
  };

  const finalLevel = modal(details.final_levels);
  const level = Math.min(10, Math.max(1, Number(finalLevel?.level ?? 8)));

  const core = details.unit_stats
    .filter((unit) => unit.pcnt >= CORE_SHARE && isShopUnit(unit.unit))
    .sort((a, b) => b.pcnt - a.pcnt || a.unit.localeCompare(b.unit))
    .slice(0, level);
  if (core.length < MIN_BOARD_UNITS) return undefined;

  const units: CompUnitInput[] = core.map((unit) => ({
    apiName: unit.unit,
    share: unit.pcnt,
    star: modal(unit.tiers)?.tier ?? 2,
    cells: details.positioning.units[unit.unit]?.positions ?? [],
    builds: details.builds
      .filter((build) => build.unit === unit.unit)
      .map((build) => ({ items: build.buildName, count: build.count, avgPlace: build.avg })),
  }));

  const byName = new Map(units.map((unit) => [unit.apiName, unit]));
  const board: PlacedUnit[] = assignCarries(
    placeUnits(units).flatMap((hex) => {
      const unit = byName.get(hex.apiName);
      if (!unit) return [];
      return [
        {
          ...hex,
          star: unit.star,
          carry: false,
          items: pickItems(unit, allowBuild),
          share: unit.share,
          builds: unit.builds,
        },
      ];
    }),
  );
  if (!board.some((unit) => unit.carry)) return undefined;

  const onBoard = new Set(board.map((unit) => unit.apiName));
  const flexUnits = details.unit_stats
    .filter((unit) => unit.pcnt >= FLEX_SHARE && unit.pcnt < CORE_SHARE && isShopUnit(unit.unit) && !onBoard.has(unit.unit))
    .sort((a, b) => b.pcnt - a.pcnt || a.unit.localeCompare(b.unit))
    .slice(0, MAX_FLEX_UNITS)
    .map((unit) => unit.unit);

  // The earliest level the feed reports an opener for: what to hold in stage 2.
  const earliest = Object.keys(details.early_options).sort((a, b) => Number(a) - Number(b))[0];
  const opener = earliest === undefined ? undefined : modal(details.early_options[earliest] ?? []);
  const earlyUnits = (opener?.unit_list.split("&") ?? [])
    .map((unit) => unit.trim())
    .filter((unit) => isShopUnit(unit))
    .slice(0, MAX_EARLY_UNITS);

  const display = (apiName: string) => references.index.champions.get(apiName)?.name ?? apiName;
  const carries = board.filter((unit) => unit.carry).sort((a, b) => (a.priority ?? 9) - (b.priority ?? 9));
  const styleUnits = board.map((unit) => ({
    apiName: unit.apiName,
    cost: references.costs.get(unit.apiName) ?? 0,
    star: unit.star,
    carry: unit.carry,
  }));
  const style = compStyle(level, styleUnits);
  const lead = carries[0];

  const sample = `${num(stats.boards)} boards, avg ${stats.avgPlace.toFixed(2)}`;
  const summary =
    `Ends at level ${level}` +
    (lead ? ` with ${display(lead.apiName)} carrying` : "") +
    `. ${SOURCE_NAME} ${input.bracket}: ${sample}, picked ${stats.pickRate.toFixed(1)}% of boards.`;

  const timings = levelTimings(details, level);
  const itemLines = carries.flatMap((unit) => {
    if (!unit.items.length) return [];
    const items = unit.items.map((item) => references.index.items.get(item)?.name ?? item).join(", ");
    return [`- **${display(unit.apiName)}**: ${items}`];
  });

  const guide = [
    earlyUnits.length
      ? `**Early:** the most-played opener is ${earlyUnits.map(display).join(", ")}.`
      : "**Early:** the feed reports no single common opener — play the strongest board you are offered.",
    timings.length ? `**Levelling:** ${timings.join(", ")}.` : `**Levelling:** most boards end at level ${level}.`,
    itemLines.length ? `**Items**, in the order to build them:\n${itemLines.join("\n")}` : undefined,
    "**Positioning:** every unit is on the hex it was played on most often in this comp, so treat it as a starting point rather than a solved board.",
    `_Generated from ${SOURCE_NAME} ${input.bracket} boards on patch ${input.patch}: ${sample}. These are the boards people played, not a plan somebody wrote — read the numbers before trusting the comp._`,
  ]
    .filter((line) => line !== undefined)
    .join("\n\n");

  return {
    units: board.length,
    source: {
      slug: input.slug,
      name: input.name,
      tier: input.tier,
      style,
      difficulty: compDifficulty(style, level),
      patch: input.patch,
      order: input.order,
      gem: stats.pickRate < GEM_MAX_PICK_RATE && stats.avgPlace <= GEM_MAX_AVG_PLACE,
      summary,
      avgPlace: stats.avgPlace,
      pickRate: stats.pickRate,
      levelRecommended: level,
      earlyUnits,
      flexUnits,
      board,
      guide,
      provenance: [
        `Source: ${SOURCE_NAME} ${COMPS_ORIGIN}, cluster ${input.slug}, ${input.bracket}.`,
        `Sample: ${sample}, patch ${input.patch}, set ${input.setId}.`,
        "Board, stars and items are each unit's most-played choice in this comp.",
        "The comps feed ignores rank and day filters, so the bracket above is applied here",
        "from its own per-rank breakdown. It publishes no placement histogram, so there is",
        "no top4_rate to write.",
      ],
    },
  };
}

/** Runs `worker` over `items`, a few at a time, keeping the input order. */
async function mapLimit<T, R>(items: readonly T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await worker(items[index]!);
      }
    }),
  );
  return results;
}

async function planComps(input: {
  setId: number;
  patch: string;
  bracket: string;
  ranks: ReadonlySet<string>;
  maxComps: number;
  minBoards: number;
  references: References;
}): Promise<{ plans: CompPlan[]; stale: string[]; skipped: string[] }> {
  const { setId, references } = input;
  const info = await fetchClusterInfo();
  if (info.setId !== setId) {
    throw new Error(`${SOURCE_NAME} comps are for set ${info.setId}, but the tier feeds report set ${setId}.`);
  }
  const totals = await fetchCompTotals(info.clusterId);

  // Selection is by overall popularity, which is the only figure available without
  // fetching every comp; the bracket filter below then re-ranks and drops the thin ones.
  const candidates = info.clusters
    .map((cluster) => ({ cluster, total: totals.get(cluster.cluster) }))
    .flatMap((row) => (row.total ? [{ ...row, total: row.total }] : []))
    .sort((a, b) => b.total.count - a.total.count)
    .slice(0, input.maxComps + CANDIDATE_MARGIN);

  const fetched = await mapLimit(candidates, COMP_FETCH_CONCURRENCY, async (row) => ({
    cluster: row.cluster,
    details: await fetchCompDetails(row.cluster.cluster, info.clusterId),
  }));

  const skipped: string[] = [];
  const rated = fetched
    .flatMap((row) => {
      const name = compName(row.cluster.nameParts, references);
      if (name === undefined) {
        skipped.push(`${row.cluster.cluster}: none of its name parts resolve to set ${setId} names`);
        return [];
      }
      const stats = rankStats(row.details.ranks, input.ranks);
      if (!stats) {
        skipped.push(`${name}: no boards in ${input.bracket}`);
        return [];
      }
      if (stats.boards < input.minBoards) {
        skipped.push(`${name}: ${num(stats.boards)} boards in ${input.bracket}, under the ${num(input.minBoards)} floor`);
        return [];
      }
      return [{ ...row, name, stats }];
    })
    .sort((a, b) => b.stats.pickRate - a.stats.pickRate || a.name.localeCompare(b.name))
    .slice(0, input.maxComps);

  // Tiers are the same percentile bands the tier lists use, over this selection.
  const byAvg = [...rated].sort((a, b) => a.stats.avgPlace - b.stats.avgPlace || a.name.localeCompare(b.name));
  const tiers = assignTiers(byAvg.map((row) => row.stats.avgPlace));
  const tierOf = new Map(byAvg.map((row, index) => [row.cluster.cluster, tiers[index]!]));

  const plans: CompPlan[] = [];
  const claimed = new Set<string>();
  for (const [index, row] of rated.entries()) {
    const slug = slugify(row.name);
    if (!slug || claimed.has(slug)) {
      skipped.push(`${row.name}: slug "${slug}" is already used by another comp this run`);
      continue;
    }
    const built = buildComp({
      slug,
      name: row.name,
      details: row.details,
      stats: row.stats,
      tier: tierOf.get(row.cluster.cluster) ?? "C",
      order: index + 1,
      patch: input.patch,
      setId,
      bracket: input.bracket,
      references,
    });
    if (!built) {
      skipped.push(
        `${row.name}: fewer than ${MIN_BOARD_UNITS} set ${setId} shop units on the board, or no carry among them`,
      );
      continue;
    }
    claimed.add(slug);

    const file = `${CURATED_DIR}/${setId}/${COMPS_DIR}/${slug}.yaml`;
    const before = existsSync(file) ? await readFile(file, "utf8") : undefined;
    const text = buildCompYaml(built.source);
    const status: CompPlan["status"] =
      before === undefined
        ? "new"
        : !isGenerated(before)
          ? "hand-written"
          : compFingerprint(before) === compFingerprint(text)
            ? "unchanged"
            : "changed";

    plans.push({
      slug,
      file,
      text,
      name: row.name,
      tier: built.source.tier,
      style: built.source.style,
      stats: row.stats,
      gem: built.source.gem,
      units: built.units,
      status,
    });
  }

  // Generated comps that dropped out of the selection. Hand-written files never do.
  const dir = `${CURATED_DIR}/${setId}/${COMPS_DIR}`;
  const keep = new Set(plans.map((plan) => plan.slug));
  const stale: string[] = [];
  if (existsSync(dir)) {
    for (const name of (await readdir(dir)).sort()) {
      if (!/\.ya?ml$/.test(name)) continue;
      const slug = name.replace(/\.ya?ml$/, "");
      if (keep.has(slug)) continue;
      const file = `${dir}/${name}`;
      if (isGenerated(await readFile(file, "utf8"))) stale.push(file);
    }
  }
  return { plans, stale, skipped };
}

function reportComps(plans: readonly CompPlan[], stale: readonly string[], skipped: readonly string[], dir: string) {
  console.log(`\n${dir}/`);
  const spread = TIER_RANKS.map((tier) => `${tier} ${plans.filter((plan) => plan.tier === tier).length}`).join(" · ");
  console.log(`  ${plural(plans.length, "comp")}  (${spread})`);
  for (const plan of plans) {
    const mark = { new: "+", changed: "~", unchanged: " ", "hand-written": "!" }[plan.status];
    console.log(
      `    ${mark} ${plan.slug.padEnd(28)} ${plan.tier} ${plan.style.padEnd(9)} ` +
        `${plan.units}u  avg ${plan.stats.avgPlace.toFixed(2)}  pick ${plan.stats.pickRate.toFixed(1)}%  ` +
        `${num(plan.stats.boards)} boards${plan.gem ? "  gem" : ""}` +
        (plan.status === "hand-written" ? "  (hand-written on disk: kept, not overwritten)" : ""),
    );
  }
  if (stale.length) {
    console.log(`  ${plural(stale.length, "generated comp")} no longer in the selection, so they will be removed:`);
    for (const file of stale) console.log(`    - ${file}`);
  }
  if (skipped.length) {
    console.log(`  skipped ${plural(skipped.length, "comp")}:`);
    for (const line of skipped.slice(0, 8)) console.log(`    ${line}`);
  }
}

/** The same check `pnpm seed:curated` runs, against text that is still in memory. */
function validateCompPlans(plans: readonly CompPlan[], setId: number, references: References): SeedIssue[] {
  const comps: SeedComp[] = [];
  const issues = plans.flatMap((plan) => {
    const result = validateComp({ file: plan.file, text: plan.text, setId, index: references.index });
    if (result.comp) comps.push(result.comp);
    return result.issues;
  });
  return [...issues, ...checkCompSet(comps)];
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
      "no-comps": { type: "boolean", default: false },
      "max-comps": { type: "string", default: String(DEFAULT_MAX_COMPS) },
      "min-boards": { type: "string", default: String(DEFAULT_MIN_COMP_BOARDS) },
    },
  });

  const minGames = Number(values["min-games"]);
  if (!Number.isInteger(minGames) || minGames < 0) {
    throw new Error(`--min-games expects a whole number, got "${values["min-games"]}"`);
  }
  if (!/^\d+$/.test(values.days)) throw new Error(`--days expects a whole number, got "${values.days}"`);
  const maxComps = Number(values["max-comps"]);
  if (!Number.isInteger(maxComps) || maxComps < 1) {
    throw new Error(`--max-comps expects a whole number of at least 1, got "${values["max-comps"]}"`);
  }
  const minBoards = Number(values["min-boards"]);
  if (!Number.isInteger(minBoards) || minBoards < 0) {
    throw new Error(`--min-boards expects a whole number, got "${values["min-boards"]}"`);
  }
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

  const comps = values["no-comps"]
    ? undefined
    : await planComps({
        setId,
        patch: championFeed.patch,
        bracket,
        ranks: new Set(values.rank.split(",").map((rank) => rank.trim().toUpperCase()).filter(Boolean)),
        maxComps,
        minBoards,
        references,
      });
  if (comps) reportComps(comps.plans, comps.stale, comps.skipped, `${CURATED_DIR}/${setId}/${COMPS_DIR}`);

  const issues = [
    ...validatePlans(plans, setId, references),
    ...(comps ? validateCompPlans(comps.plans, setId, references) : []),
  ];
  if (issues.length) {
    console.error(`\n${plural(issues.length, "problem")} in the generated files; nothing was written:\n`);
    for (const issue of issues) console.error(`  ${formatIssue(issue)}`);
    process.exitCode = 1;
    return;
  }

  const writtenTiers = plans.filter((plan) => !plan.unchanged);
  // A hand-written comp is never rewritten, so it never reaches this list.
  const writtenComps = comps?.plans.filter((plan) => plan.status === "new" || plan.status === "changed") ?? [];
  const stale = comps?.stale ?? [];

  if (values["dry-run"]) {
    console.log(
      "\nDry run: everything valid, nothing written. Would write " +
        `${plural(writtenTiers.length, "tier list")} and ${plural(writtenComps.length, "comp")}` +
        (stale.length ? `, and remove ${plural(stale.length, "generated comp")}` : "") +
        ".",
    );
    if (values.seed) console.log("--seed does nothing in a dry run; the files on disk did not change.");
    return;
  }

  for (const plan of [...writtenTiers, ...writtenComps]) {
    await mkdir(dirname(plan.file), { recursive: true });
    await writeFile(plan.file, plan.text, "utf8");
  }
  for (const file of stale) await unlink(file);

  console.log(
    writtenTiers.length || writtenComps.length
      ? `\nWrote ${plural(writtenTiers.length, "tier list")} and ${plural(writtenComps.length, "comp")}.`
      : "\nEverything was already up to date.",
  );
  if (stale.length) console.log(`Removed ${plural(stale.length, "generated comp")} that left the selection.`);

  if (values.seed) runSeed();
  else if (writtenTiers.length || writtenComps.length || stale.length) {
    console.log("Run pnpm seed:curated to publish them (or pass --seed next time).");
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
