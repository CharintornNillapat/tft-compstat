import { Document, parse } from "yaml";
import { TIER_RANKS, type TierRank } from "@/lib/static/game";
import { type TierListKind } from "./schemas";

/**
 * External meta feed → curated tier list YAML (`pnpm sync:meta`).
 * Pure: the script supplies the fetched rows, the reference index and the file text.
 *
 * The one judgement here is `TIER_SHARES`: a tier is a slice of the ranking, so how
 * big each slice is — not a hand ranking — decides who sits where. Everything else is
 * bookkeeping that keeps a generated file reviewable in git: a stable order, a
 * header saying where the numbers came from, and hand-written `notes` carried over.
 *
 * **What this does not measure.** A unit's average placement is the average of the
 * *boards it appeared on*, not its own strength: a 5-cost that mostly shows up in
 * won-out games reads better than it plays. The bands are a starting point for a
 * human pass, which is why `notes` survives a sync and why the summary names its source.
 */

/** Placement counts, index 0 = 1st place … index 7 = 8th. */
export type Placements = readonly number[];

/** One feed row, already resolved to an `api_name` in our static tables. */
export type MetaRow = { apiName: string; places: Placements };

export type RankedEntry = { apiName: string; tier: TierRank; avgPlace: number; games: number };

/** A row dropped for too small a sample to rate. */
export type ThinRow = { apiName: string; games: number };

/**
 * Percentile bands, best first: a rated list is cut by *rank*, not by an absolute
 * average. Champions bunch tightly around 4.5 while items spread much wider, so one
 * pair of fixed cutoffs rates one list as a histogram slice (an A tier of 2 in 55)
 * and the other as a flat top half. Shares give both the shape a tier list is read as.
 *
 * The cost is that a tier is relative: a C-tier unit is in the bottom fifth of what
 * is played, not bad in the abstract, and every list has an S tier even on a patch
 * where nothing stands out. That is the usual tier-list convention, and the header
 * records where the bands actually fell so the ranking can be read for what it is.
 */
export const TIER_SHARES = [
  { tier: "S", share: 0.15 },
  { tier: "A", share: 0.3 },
  { tier: "B", share: 0.35 },
  { tier: "C", share: 0.2 },
] as const satisfies readonly { tier: TierRank; share: number }[];

export function totalGames(places: Placements): number {
  return places.reduce((sum, count) => sum + count, 0);
}

/** Mean finishing position, or undefined when the row has no games to average. */
export function averagePlacement(places: Placements): number | undefined {
  const games = totalGames(places);
  if (games === 0) return undefined;
  return places.reduce((sum, count, index) => sum + count * (index + 1), 0) / games;
}

/**
 * Where each band ends in a list of `count` rows, as an index into it.
 *
 * The shares are accumulated *before* rounding rather than rounded one band at a
 * time, so the rounding error cannot compound across four bands: the cuts stay in
 * order and the last is exactly `count`, which is what puts every row in one tier.
 */
export function tierCuts(count: number): number[] {
  let cumulative = 0;
  return TIER_SHARES.map(({ share }, index) => {
    cumulative += share;
    return index === TIER_SHARES.length - 1 ? count : Math.min(count, Math.round(cumulative * count));
  });
}

/**
 * Tier per row, for a list already sorted best average placement first.
 *
 * A band is extended over a tie rather than splitting it: two rows with the same
 * average must not land in different tiers, since — with the api-name tiebreak in
 * `rankRows` — that would read as alphabetical order deciding a rating.
 */
export function assignTiers(avgPlaces: readonly number[]): TierRank[] {
  const cuts = tierCuts(avgPlaces.length);
  const tiers: TierRank[] = [];
  let start = 0;
  for (const [index, { tier }] of TIER_SHARES.entries()) {
    // max() because a band extended over a tie can run past the next raw cut.
    let end = Math.max(cuts[index]!, start);
    while (end > start && end < avgPlaces.length && avgPlaces[end] === avgPlaces[end - 1]) end++;
    for (let row = start; row < end; row++) tiers[row] = tier;
    start = end;
  }
  return tiers;
}

/** The bands as one line, for the generated file's header. */
export function describeBands(): string {
  return TIER_SHARES.map(({ tier, share }, index) =>
    index === TIER_SHARES.length - 1
      ? `${tier} the rest`
      : `${tier} ${index === 0 ? "top" : "next"} ${Math.round(share * 100)}%`,
  ).join(", ");
}

/**
 * Where the bands actually fell — the worst average placement in each, and its size.
 * With percentile bands that boundary moves from run to run, so it is the one number
 * a reader cannot work out from the shares alone.
 */
export function describeBandEdges(entries: readonly RankedEntry[]): string {
  return TIER_RANKS.flatMap((tier) => {
    const inTier = entries.filter((entry) => entry.tier === tier);
    const worst = inTier[inTier.length - 1];
    return worst ? [`${tier} ${inTier.length} to ${worst.avgPlace.toFixed(2)}`] : [];
  }).join(", ");
}

/**
 * Rates every row with enough games, sorts them best average placement first, then
 * cuts that ranking into the bands above.
 *
 * Ties break on `api_name` so the same feed always produces the same file, which is
 * what makes a diff of a generated file mean something.
 */
export function rankRows(
  rows: readonly MetaRow[],
  minGames: number,
): { entries: RankedEntry[]; thin: ThinRow[] } {
  const rated: { apiName: string; avgPlace: number; games: number }[] = [];
  const thin: ThinRow[] = [];
  for (const { apiName, places } of rows) {
    const games = totalGames(places);
    const avgPlace = averagePlacement(places);
    if (avgPlace === undefined || games < minGames) {
      thin.push({ apiName, games });
      continue;
    }
    rated.push({ apiName, avgPlace, games });
  }
  rated.sort((a, b) => a.avgPlace - b.avgPlace || a.apiName.localeCompare(b.apiName));

  const tiers = assignTiers(rated.map((row) => row.avgPlace));
  const entries: RankedEntry[] = rated.map((row, index) => ({ ...row, tier: tiers[index]! }));
  thin.sort((a, b) => b.games - a.games || a.apiName.localeCompare(b.apiName));
  return { entries, thin };
}

/**
 * Tier → api names. `entries` is already best-first overall and a tier is a band of
 * that same number, so slicing it per tier leaves each row sorted best to worst.
 * Empty tiers are left out rather than written as an empty row.
 */
export function groupByTier(entries: readonly RankedEntry[]): Partial<Record<TierRank, string[]>> {
  const tiers: Partial<Record<TierRank, string[]>> = {};
  for (const tier of TIER_RANKS) {
    const names = entries.filter((entry) => entry.tier === tier).map((entry) => entry.apiName);
    if (names.length) tiers[tier] = names;
  }
  return tiers;
}

/** What a sync would change, for the `--dry-run` report. */
export type TierChange =
  | { change: "added"; apiName: string; to: TierRank }
  | { change: "removed"; apiName: string; from: TierRank }
  | { change: "moved"; apiName: string; from: TierRank; to: TierRank };

export function diffTiers(
  before: Partial<Record<TierRank, readonly string[]>>,
  after: Partial<Record<TierRank, readonly string[]>>,
): TierChange[] {
  const index = (tiers: Partial<Record<TierRank, readonly string[]>>) =>
    new Map(TIER_RANKS.flatMap((tier) => (tiers[tier] ?? []).map((apiName) => [apiName, tier] as const)));
  const old = index(before);
  const next = index(after);
  const changes: TierChange[] = [];
  for (const [apiName, to] of next) {
    const from = old.get(apiName);
    if (from === undefined) changes.push({ change: "added", apiName, to });
    else if (from !== to) changes.push({ change: "moved", apiName, from, to });
  }
  for (const [apiName, from] of old) {
    if (!next.has(apiName)) changes.push({ change: "removed", apiName, from });
  }
  return changes;
}

/**
 * The parts of an existing tier list a sync must not throw away. Anything unreadable
 * reads as "no previous file": a sync then writes a fresh one rather than failing on
 * a file it is about to replace anyway.
 */
export type ExistingTierList = {
  tiers: Partial<Record<TierRank, string[]>>;
  notes: Record<string, string>;
  current: boolean | undefined;
  patch: string | undefined;
};

export function readExistingTierList(text: string): ExistingTierList {
  const empty: ExistingTierList = { tiers: {}, notes: {}, current: undefined, patch: undefined };
  let data: unknown;
  try {
    data = parse(text);
  } catch {
    return empty;
  }
  if (typeof data !== "object" || data === null) return empty;
  const file = data as Record<string, unknown>;
  const record = (value: unknown) =>
    typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

  const tiers: Partial<Record<TierRank, string[]>> = {};
  const rawTiers = record(file.tiers);
  for (const tier of TIER_RANKS) {
    const names = rawTiers[tier];
    if (Array.isArray(names)) tiers[tier] = names.filter((name): name is string => typeof name === "string");
  }

  const notes: Record<string, string> = {};
  for (const [apiName, note] of Object.entries(record(file.notes))) {
    if (typeof note === "string") notes[apiName] = note;
  }

  return {
    tiers,
    notes,
    current: typeof file.current === "boolean" ? file.current : undefined,
    patch: typeof file.patch === "string" ? file.patch : undefined,
  };
}

/**
 * What a reader of the file actually cares about — the ratings, not the header.
 *
 * The sample size in the provenance grows between any two runs, so comparing whole
 * file text would rewrite both files on every sync and bury a real tier change in a
 * daily no-op diff. A sync writes only when this changes.
 */
export function tierListFingerprint(input: {
  patch: string | undefined;
  current: boolean | undefined;
  tiers: Partial<Record<TierRank, readonly string[]>>;
  notes: Readonly<Record<string, string>>;
}): string {
  const listed = new Set(TIER_RANKS.flatMap((tier) => input.tiers[tier] ?? []));
  return JSON.stringify({
    patch: input.patch,
    current: input.current,
    tiers: TIER_RANKS.map((tier) => [tier, input.tiers[tier] ?? []]),
    notes: Object.entries(input.notes)
      .filter(([apiName]) => listed.has(apiName))
      .sort(([a], [b]) => a.localeCompare(b)),
  });
}

/** `champions-18.2` / `items-18.2`; unique per patch, so a new patch is a new list. */
export function tierListSlug(kind: TierListKind, patch: string): string {
  return `${kind === "champion" ? "champions" : "items"}-${patch}`;
}

export type TierListSource = {
  kind: TierListKind;
  patch: string;
  /** Whether this is the list the site shows for its kind. */
  current: boolean;
  entries: readonly RankedEntry[];
  /** Carried over from the previous file; keys that left the tiers are dropped. */
  notes: Readonly<Record<string, string>>;
  /** Shown above the list on the site — say where the numbers came from. */
  summary: string;
  /** Header comment lines, after the generated-file warning this adds itself. */
  provenance: readonly string[];
};

const GENERATED_WARNING = [
  "GENERATED by `pnpm sync:meta`. Hand edits are overwritten on the next sync —",
  "change the script, or the numbers it reads, rather than this file.",
  "`notes:` is the exception: it is carried across syncs, so hover notes survive.",
];

/**
 * The file text: header comment, then the same shape `tierListFileSchema` accepts.
 * Block sequences rather than the flow lists a hand-written file uses, so a unit
 * changing tier is one line of a git diff instead of a rewritten line.
 */
export function buildTierListYaml(source: TierListSource): string {
  const tiers = groupByTier(source.entries);
  const listed = new Set(Object.values(tiers).flat());
  // A note whose unit left the list would fail the seed, so it goes with the unit.
  const notes = Object.fromEntries(
    Object.entries(source.notes)
      .filter(([apiName]) => listed.has(apiName))
      .sort(([a], [b]) => a.localeCompare(b)),
  );

  const doc = new Document({
    slug: tierListSlug(source.kind, source.patch),
    kind: source.kind,
    patch: source.patch,
    current: source.current,
    summary: source.summary,
    tiers,
    ...(Object.keys(notes).length ? { notes } : {}),
  });

  const header = [...GENERATED_WARNING, "", ...source.provenance]
    .map((line) => (line ? `# ${line}` : "#"))
    .join("\n");
  // lineWidth 0 disables folding, so a long summary stays on one line.
  return `${header}\n${doc.toString({ lineWidth: 0 })}`;
}
