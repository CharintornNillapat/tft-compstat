import { z } from "zod";
import { isTraitKind, type TraitKind } from "@/lib/static/game";

/**
 * The MetaTFT HTTP layer shared by `sync-meta`: the stat feed behind the tier lists
 * (§7.1) and the comps feed behind the generated comps (§7.2).
 *
 * The comps feed is a different service from the stat feed, with different rules —
 * most importantly it does **not** honour `rank` or `days` (verified: the response is
 * byte-identical with and without them). What it does give is a per-rank breakdown per
 * comp, so `rankStats` does the bracket filtering here instead.
 */

export const SOURCE_NAME = "MetaTFT";
export const STAT_ORIGIN = "https://api-hc.metatft.com/tft-stat-api";
export const COMPS_ORIGIN = "https://api-hc.metatft.com/tft-comps-api";

export async function getJson(url: URL): Promise<unknown> {
  const response = await fetch(url, {
    // Identify the caller rather than pretending to be a browser: this is a handful
    // of requests against a public endpoint, run by hand.
    headers: { accept: "application/json", "user-agent": "tft-compstat/0.1 (pnpm sync:meta)" },
  });
  if (!response.ok) throw new Error(`GET ${url.href} failed: ${response.status} ${response.statusText}`);
  return response.json();
}

function parseFeed<T>(schema: z.ZodType<T>, json: unknown, what: string): T {
  const parsed = schema.safeParse(json);
  if (parsed.success) return parsed.data;
  throw new Error(
    `${SOURCE_NAME} ${what} did not match the expected shape (the feed may have changed):\n` +
      parsed.error.issues.map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`).join("\n"),
  );
}

/** `TFTSet18` → 18. The feed labels the set it reports, and we refuse to guess. */
export function parseFeedSet(label: string): number {
  const match = /^TFTSet(\d+)$/.exec(label);
  if (!match) throw new Error(`${SOURCE_NAME} reported the set as "${label}", which this script can't read.`);
  return Number(match[1]);
}

/** A comp's identity: which units it runs and what MetaTFT calls it. */
const clusterSchema = z.object({
  Cluster: z.number(),
  units_string: z.string(),
  /** The weighted parts the display name is built from: a trait and its carries. */
  name: z.array(z.object({ name: z.string(), type: z.string() })),
});

const clusterInfoSchema = z.object({
  tft_set: z.string(),
  cluster_id: z.number(),
  cluster_info: z.object({ cluster_details: z.object({ clusters: z.array(clusterSchema) }) }),
});

export type Cluster = { cluster: string; nameParts: { name: string; type: string }[]; units: string[] };

export type ClusterInfo = { clusterId: number; setId: number; clusters: Cluster[] };

/** The current clustering: which comps exist this patch, and the id the rest needs. */
export async function fetchClusterInfo(): Promise<ClusterInfo> {
  const feed = parseFeed(clusterInfoSchema, await getJson(new URL(`${COMPS_ORIGIN}/latest_cluster_info`)), "cluster info");
  return {
    clusterId: feed.cluster_id,
    setId: parseFeedSet(feed.tft_set),
    clusters: feed.cluster_info.cluster_details.clusters.map((row) => ({
      cluster: String(row.Cluster),
      nameParts: row.name,
      units: row.units_string.split(",").map((unit) => unit.trim()).filter(Boolean),
    })),
  };
}

const compOptionsSchema = z.object({
  results: z.object({
    /** Cluster id → one row of totals. Every comp of the set, in a single request. */
    overall: z.record(z.string(), z.array(z.object({ count: z.number(), avg: z.number() }))),
  }),
});

/** Every comp's board count and average placement, for picking which ones to write. */
export async function fetchCompTotals(clusterId: number): Promise<Map<string, { count: number; avg: number }>> {
  const url = new URL(`${COMPS_ORIGIN}/comp_options`);
  url.searchParams.set("cluster_id", String(clusterId));
  const feed = parseFeed(compOptionsSchema, await getJson(url), "comp totals");
  const totals = new Map<string, { count: number; avg: number }>();
  for (const [cluster, rows] of Object.entries(feed.results.overall)) {
    const row = rows[0];
    if (row) totals.set(cluster, row);
  }
  return totals;
}

const shareRow = z.object({ count: z.number(), pcnt: z.number() });

const compDetailsSchema = z.object({
  results: z.object({
    /** Per-rank totals. The only way to answer `--rank`, since the feed ignores it. */
    ranks: z.array(z.object({ rank: z.string(), count: z.number(), avg: z.number(), pick: z.number() })),
    unit_stats: z.array(
      z.object({
        unit: z.string(),
        count: z.number(),
        pcnt: z.number(),
        tiers: z.array(shareRow.extend({ tier: z.number() })),
        num_items: z.array(shareRow.extend({ num_items: z.number() })),
      }),
    ),
    builds: z.array(
      z.object({ unit: z.string(), buildName: z.array(z.string()), count: z.number(), avg: z.number() }),
    ),
    final_levels: z.array(z.object({ level: z.string(), count: z.number(), avg: z.number() })),
    levels: z.array(z.object({ level: z.number(), stage: z.string(), round: z.string(), count: z.number() })),
    positioning: z.object({
      units: z.record(z.string(), z.object({ positions: z.array(z.object({ cell: z.string(), count: z.number() })) })),
    }),
    early_options: z.record(z.string(), z.array(z.object({ unit_list: z.string(), count: z.number(), avg: z.number() }))),
  }),
});

export type CompDetails = z.infer<typeof compDetailsSchema>["results"];

export async function fetchCompDetails(cluster: string, clusterId: number): Promise<CompDetails> {
  const url = new URL(`${COMPS_ORIGIN}/comp_details`);
  url.searchParams.set("comp", cluster);
  url.searchParams.set("cluster_id", String(clusterId));
  return parseFeed(compDetailsSchema, await getJson(url), `comp details for ${cluster}`).results;
}

/**
 * The comp's numbers inside one rank bracket.
 *
 * The bracket's own total is recovered from the feed's per-rank `pick`
 * (`boards / pick` is how many boards that rank played in all), which keeps the pick
 * rate consistent with the number MetaTFT shows rather than a denominator of our own.
 */
export function rankStats(
  ranks: CompDetails["ranks"],
  wanted: ReadonlySet<string>,
): { boards: number; avgPlace: number; pickRate: number } | undefined {
  let boards = 0;
  let placeSum = 0;
  let bracket = 0;
  for (const row of ranks) {
    if (!wanted.has(row.rank.toUpperCase())) continue;
    boards += row.count;
    placeSum += row.count * row.avg;
    if (row.pick > 0) bracket += row.count / row.pick;
  }
  if (boards === 0 || bracket === 0) return undefined;
  return { boards, avgPlace: placeSum / boards, pickRate: (boards / bracket) * 100 };
}

/* ------------------------------------------------------------ lookups (§4.8) */

export const LOOKUP_ORIGIN = "https://data.metatft.com/lookups";

const lookupSchema = z.object({
  traits: z.array(z.object({ apiName: z.string(), type: z.string().nullish() })),
  _metadata: z.object({ set: z.string() }),
});

/**
 * Trait type by api name, from MetaTFT's per-set lookup file. It is the one source
 * that has it — CommunityDragon and Data Dragon carry no origin/class split — so
 * `sync:static` reads this and nothing else from MetaTFT. A type it does not
 * recognise is dropped rather than stored.
 */
export async function fetchTraitKinds(setId: number): Promise<Map<string, TraitKind>> {
  const url = new URL(`${LOOKUP_ORIGIN}/TFTSet${setId}_latest_en_us.json`);
  const feed = parseFeed(lookupSchema, await getJson(url), `set ${setId} lookup`);
  if (parseFeedSet(feed._metadata.set) !== setId) {
    throw new Error(`${SOURCE_NAME} lookup for set ${setId} describes ${feed._metadata.set}.`);
  }
  const kinds = new Map<string, TraitKind>();
  for (const trait of feed.traits) {
    const kind = trait.type?.toLowerCase();
    if (isTraitKind(kind)) kinds.set(trait.apiName, kind);
  }
  return kinds;
}

/* ------------------------------------------------------------ augments (§7.5) */

const augmentTierListSchema = z.object({
  tft_set: z.string(),
  /** Epoch milliseconds. */
  updated: z.number(),
  content: z.object({
    author: z.object({ gameName: z.string().nullish() }).nullish(),
    content: z.object({
      /** Labels S…D, best first; each lists augment api names in the author's order. */
      tierList: z.array(z.object({ label: z.string(), content: z.array(z.object({ id: z.string() })) })),
    }),
  }),
});

export type AugmentTierListFeed = {
  setId: number;
  updated: Date;
  author: string | null;
  tiers: { label: string; ids: string[] }[];
};

/**
 * MetaTFT's augment tier list. **A graded list, not measured stats**: Set 18 match
 * data carries no augments, so no site can compute an augment's placement, and the
 * stat routes that would (`tft-stat-api/augments`) answer 500.
 */
export async function fetchAugmentTierList(): Promise<AugmentTierListFeed> {
  const feed = parseFeed(augmentTierListSchema, await getJson(new URL(`${STAT_ORIGIN}/augments_tiers`)), "augment tiers");
  return {
    setId: parseFeedSet(feed.tft_set),
    updated: new Date(feed.updated),
    author: feed.content.author?.gameName ?? null,
    tiers: feed.content.content.tierList.map((tier) => ({
      label: tier.label,
      ids: tier.content.map((entry) => entry.id),
    })),
  };
}

const compAugmentTiersSchema = z.object({
  tft_set: z.string(),
  cluster_id: z.number(),
  results: z.record(
    z.string(),
    z.object({
      /** The guide the grades were taken from, e.g. "DRAVEN > Legendaries > Lvl 9". */
      source_title: z.string().nullish(),
      augments: z.array(z.object({ id: z.string(), tier: z.string() })),
    }),
  ),
});

export type CompAugmentTiers = Map<string, { source: string | null; augments: { id: string; tier: string }[] }>;

/**
 * Per comp cluster, the augment grades of the guide closest to it. Several clusters
 * share one guide, and a cluster with no guide is simply absent.
 */
export async function fetchCompAugmentTiers(clusterId: number, setId: number): Promise<CompAugmentTiers> {
  const url = new URL(`${COMPS_ORIGIN}/comp_augment_tiers`);
  url.searchParams.set("cluster_id", String(clusterId));
  const feed = parseFeed(compAugmentTiersSchema, await getJson(url), "comp augment tiers");
  if (parseFeedSet(feed.tft_set) !== setId || feed.cluster_id !== clusterId) {
    throw new Error(
      `${SOURCE_NAME} comp augment tiers are for ${feed.tft_set} cluster ${feed.cluster_id}, ` +
        `but the comps are set ${setId} cluster ${clusterId}. Retry in a moment.`,
    );
  }
  return new Map(
    Object.entries(feed.results).map(([cluster, row]) => [
      cluster,
      { source: row.source_title?.trim() || null, augments: row.augments },
    ]),
  );
}

/** The value with the largest share, e.g. the star level a unit is most often played at. */
export function modal<T extends { count: number }>(rows: readonly T[]): T | undefined {
  return rows.reduce<T | undefined>((best, row) => (best === undefined || row.count > best.count ? row : best), undefined);
}
