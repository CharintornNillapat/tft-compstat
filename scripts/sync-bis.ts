/**
 * MetaTFT per-champion builds → data/curated/<setId>/champion-bis.yaml.
 *
 *   pnpm sync:bis                      fetch, derive, validate, overwrite the file
 *   pnpm sync:bis --dry-run            everything but the write, and print what would change
 *   pnpm sync:bis --rank CHALLENGER --days 7
 *   pnpm sync:bis --min-build-games 500 --min-item-games 1000
 *
 * The `unit_detail` feed publishes, per champion, every item build that was played
 * with an eight-bucket placement histogram — the same shape `sync:meta` reads — so
 * "best in slot" is **computed from placements**, not scraped from someone's guide.
 * `src/lib/curated/bis-sync.ts` holds every rule that decides which build wins, and
 * says where the measure breaks down.
 *
 * A champion whose builds are too thin to rate gets **no row** rather than a guess,
 * and the run prints why. `notes:` is hand-written and carried across syncs.
 *
 * One request per champion, so this is the slowest of the sync scripts. It is also
 * the one whose output moves least: a build order is a patch-level fact.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import {
  buildChampionBisYaml,
  compareChampions,
  deriveBis,
  diffBis,
  readExistingBisNotes,
  type BisEntry,
  type BisItemInfo,
  type BisSkip,
} from "@/lib/curated/bis-sync";
import { CHAMPION_BIS_FILE, championBisFileSchema } from "@/lib/curated/schemas";
import { formatIssue, parseYaml, type SeedIssue } from "@/lib/curated/validate";
import { getJson, parseFeedSet, SOURCE_NAME, STAT_ORIGIN } from "./lib/meta-feed";
import { loadReferences, type References } from "./lib/references";

const CURATED_DIR = "data/curated";
const RANKED_QUEUE = "1100";
/** One request per champion; this is polite and still finishes in well under a minute. */
const FETCH_CONCURRENCY = 4;
/** Changes printed in full before the report summarises the rest. */
const MAX_LISTED_CHANGES = 20;

const unitDetailSchema = z.object({
  unit: z.string(),
  tft_set: z.string(),
  /** Per patch and day: `patch` is `["18.2", ""]`, the label plus a hotfix suffix. */
  games: z.array(z.object({ patch: z.array(z.string()), count: z.number() })).default([]),
  builds: z.array(z.object({ buildNames: z.string(), places: z.array(z.number()) })).default([]),
  items: z.array(z.object({ itemName: z.string(), places: z.array(z.number()) })).default([]),
});

type UnitDetail = z.infer<typeof unitDetailSchema>;

async function fetchUnitDetail(unit: string, query: Record<string, string>): Promise<UnitDetail> {
  const url = new URL(`${STAT_ORIGIN}/unit_detail`);
  for (const [key, value] of Object.entries({ ...query, unit })) url.searchParams.set(key, value);

  const parsed = unitDetailSchema.safeParse(await getJson(url));
  if (!parsed.success) {
    throw new Error(
      `${SOURCE_NAME} unit_detail for ${unit} did not match the expected shape (the feed may have changed):\n` +
        parsed.error.issues.map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`).join("\n"),
    );
  }
  return parsed.data;
}

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

/** `items.kind` and `items.components`, which is all `deriveBis` reads. */
function itemInfoFrom(refs: References): Map<string, BisItemInfo> {
  const info = new Map<string, BisItemInfo>();
  for (const [apiName] of refs.index.items) {
    info.set(apiName, {
      kind: refs.itemKinds.get(apiName) ?? "other",
      components: refs.components.get(apiName) ?? [],
    });
  }
  return info;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** Parses a generated file back into entries, so a re-run can report what moved. */
function readEntries(text: string): BisEntry[] {
  if (!text) return [];
  const parsed = championBisFileSchema.safeParse(parseYaml("", text).data);
  if (!parsed.success) return [];
  return parsed.data.champions.map((row) => ({
    apiName: row.api_name,
    role: row.role,
    primary: row.primary_bis,
    secondary: row.secondary_bis,
    avgPlace: row.avg_place ?? 0,
    games: row.games ?? 0,
    ...(row.notes ? { note: row.notes } : {}),
  }));
}

/** Shape-checks the generated text the way the site will at build time. */
function validate(file: string, text: string): SeedIssue[] {
  const yaml = parseYaml(file, text);
  if (yaml.syntaxIssues.length) return yaml.syntaxIssues;
  const parsed = championBisFileSchema.safeParse(yaml.data);
  return parsed.success ? [] : parsed.error.issues.map((issue) => yaml.issue(issue.path, issue.message));
}

async function main() {
  const { values } = parseArgs({
    options: {
      "dry-run": { type: "boolean", default: false },
      rank: { type: "string", default: "DIAMOND,MASTER,GRANDMASTER,CHALLENGER" },
      days: { type: "string", default: "3" },
      "min-build-games": { type: "string", default: "200" },
      "min-item-games": { type: "string", default: "500" },
      set: { type: "string" },
    },
  });

  const number = (flag: string, raw: string) => {
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0) throw new Error(`--${flag} expects a whole number, got "${raw}"`);
    return value;
  };
  const thresholds = {
    minBuildGames: number("min-build-games", values["min-build-games"]),
    minItemGames: number("min-item-games", values["min-item-games"]),
  };
  if (!/^\d+$/.test(values.days)) throw new Error(`--days expects a whole number, got "${values.days}"`);

  const refs = await loadReferences();
  const query = { queue: RANKED_QUEUE, patch: "current", rank: values.rank, days: values.days };
  const ranks = values.rank.split(",");
  const bracket = ranks.length > 1 ? `${ranks[0]}+` : values.rank;

  const setId = values.set ? number("set", values.set) : Math.max(...refs.setIds);
  // Shop units only: a Riftbeast cannot be bought, so it has no build to plan for.
  const champions = [...refs.index.champions]
    .filter(([apiName, champion]) => champion.setId === setId && refs.shopUnits.has(apiName))
    .map(([apiName, champion]) => ({ apiName, name: champion.name, cost: refs.costs.get(apiName) ?? 0 }))
    .sort(compareChampions);

  if (champions.length === 0) {
    throw new Error(`No shop champions stored for set ${setId}. Run \`pnpm sync:static\` first.`);
  }

  console.log(
    `${SOURCE_NAME} ranked ${bracket}, last ${plural(Number(values.days), "day")} — ` +
      `${plural(champions.length, "champion")} of set ${setId}…`,
  );

  const itemInfo = itemInfoFrom(refs);
  const feedSets = new Set<number>();
  const skips: BisSkip[] = [];
  /**
   * One vote per champion for the patch its newest games are on, so the file states
   * the patch the numbers are from. Counting *games* per label instead would answer
   * with the patch that has been out longest, not the one being played.
   */
  const patchVotes = new Map<string, number>();

  const derived = await mapLimit(champions, FETCH_CONCURRENCY, async (champion) => {
    const detail = await fetchUnitDetail(champion.apiName, query);
    feedSets.add(parseFeedSet(detail.tft_set));
    // games[0] is the most recent day, the same entry `sync:meta` reads its patch from.
    const label = detail.games[0]?.patch[0];
    if (label) patchVotes.set(label, (patchVotes.get(label) ?? 0) + 1);
    const { build, skip } = deriveBis({
      apiName: champion.apiName,
      builds: detail.builds.map((row) => ({ items: row.buildNames.split("|"), places: row.places })),
      items: detail.items.map((row) => ({ apiName: row.itemName, places: row.places })),
      itemInfo,
      thresholds,
    });
    if (skip) skips.push(skip);
    return build ? { ...build, apiName: champion.apiName } : null;
  });

  if (feedSets.size !== 1 || !feedSets.has(setId)) {
    throw new Error(
      `The feed reports set ${[...feedSets].join(", ")} but the curated folder is set ${setId}. ` +
        "Pass --set, or wait for the feed to roll over.",
    );
  }

  const file = `${CURATED_DIR}/${setId}/${CHAMPION_BIS_FILE}`;
  const previousText = existsSync(file) ? await readFile(file, "utf8") : "";
  const notes = readExistingBisNotes(previousText);
  const entries: BisEntry[] = derived
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .map((entry) => {
      const note = notes[entry.apiName];
      return { ...entry, ...(note ? { note } : {}) };
    });

  if (entries.length === 0) {
    throw new Error(
      `No champion had a build clearing ${plural(thresholds.minBuildGames, "game")}. ` +
        "Try --days 7, or a lower --min-build-games.",
    );
  }

  // The patch the *games* are from, not the game-data version in `tft_sets.patch`
  // (that is "16.18", which would print as a patch nobody plays — architecture §4.8).
  const filePatch = [...patchVotes].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!filePatch) {
    throw new Error("The feed reported no games, so there is no patch to label the file with.");
  }

  const provenance = [
    `Source: ${SOURCE_NAME} ${STAT_ORIGIN}/unit_detail, ranked queue ${RANKED_QUEUE}, ${bracket}, last ${plural(Number(values.days), "day")}.`,
    `Primary: the 3-item build with the best average placement over ${plural(thresholds.minBuildGames, "game")}.`,
    `Alternatives: the champion's best single items outside that build, over ${plural(thresholds.minItemGames, "game")}.`,
    "Role is read off the components of the primary build, not off the champion.",
    "These are the builds that placed best, not a plan somebody wrote — read the numbers before trusting them.",
  ];

  const text = buildChampionBisYaml({ patch: filePatch, entries, provenance });

  // Checked by the same schema the site parses at build time, before anything is written.
  const issues = validate(file, text);
  if (issues.length) {
    console.error("The generated file is invalid, so nothing was written:");
    for (const issue of issues) console.error(`  ${formatIssue(issue)}`);
    process.exitCode = 1;
    return;
  }

  const changes = diffBis(readEntries(previousText), entries);
  const name = (apiName: string) => refs.index.champions.get(apiName)?.name ?? apiName;

  console.log(`\n${plural(entries.length, "champion")} with a build, ${skips.length} without.`);
  const byRole = new Map<string, number>();
  for (const entry of entries) byRole.set(entry.role, (byRole.get(entry.role) ?? 0) + 1);
  console.log([...byRole].map(([role, count]) => `${role}: ${count}`).join(" · "));

  if (changes.length === 0) {
    console.log("Nothing changed.");
  } else {
    console.log(`\n${plural(changes.length, "change")}:`);
    for (const change of changes.slice(0, MAX_LISTED_CHANGES)) {
      if (change.kind === "added") console.log(`  + ${name(change.apiName)} (${change.role})`);
      else if (change.kind === "removed") console.log(`  - ${name(change.apiName)}`);
      else console.log(`  ~ ${name(change.apiName)}`);
    }
    if (changes.length > MAX_LISTED_CHANGES) {
      console.log(`  … and ${changes.length - MAX_LISTED_CHANGES} more`);
    }
  }

  if (skips.length) {
    console.log(`\nNo build for ${skips.map((skip) => name(skip.apiName)).join(", ")}.`);
    console.log(`  Most of these are the same reason: ${skips[0]!.reason}.`);
  }

  if (values["dry-run"]) {
    console.log(`\n--dry-run: ${file} not written.`);
    return;
  }
  if (changes.length === 0 && previousText) {
    console.log(`${file} left alone.`);
    return;
  }

  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, text, "utf8");
  console.log(`\nWrote ${file}. It is read at build time, so redeploy to publish it.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
