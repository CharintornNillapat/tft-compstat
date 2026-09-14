import { Document, isSeq, parse } from "yaml";
import { AUGMENT_RARITIES, TIER_RANKS, type AugmentRarity, type TierRank } from "@/lib/static/game";
import { COMP_AUGMENTS } from "./schemas";

/**
 * Pure: MetaTFT's augment grades + CommunityDragon's augment data → the generated
 * `augment-tiers.yaml` (architecture §7.5). `scripts/sync-meta.ts` fetches; every
 * rule that decides what is written lives here, where it is tested without the network.
 *
 * **Grades, not measurements.** Set 18 match data carries no augments, so nobody can
 * compute an augment's average placement, and MetaTFT's augment stat routes answer 500.
 * The tier is MetaTFT's expert list and a comp's picks come from the guide MetaTFT
 * matched to that comp — which is why this file has no percentile bands and no stats.
 */

/**
 * CommunityDragon's hashed rarity tags. Verified on game data 16.18: 583 of the 592
 * Set 18 augments carry exactly one, and it agrees with the `_i` / `_ii` / `_iii`
 * suffix wherever the icon has one. MetaTFT's own lookup agrees on every augment both list.
 */
export const RARITY_TAGS: Readonly<Record<string, AugmentRarity>> = {
  "{d11fd6d5}": "Silver",
  "{ce1fd21c}": "Gold",
  "{cf1fd3af}": "Prismatic",
};

export function augmentRarity(tags: readonly string[] | null | undefined): AugmentRarity | undefined {
  for (const tag of tags ?? []) {
    const rarity = RARITY_TAGS[tag];
    if (rarity) return rarity;
  }
  return undefined;
}

/** MetaTFT grades S–D onto ours. D folds into C: a list with no D row (18.2) loses nothing. */
export function feedTier(label: string): TierRank | undefined {
  const upper = label.trim().toUpperCase();
  if (upper === "D") return "C";
  return (TIER_RANKS as readonly string[]).includes(upper) ? (upper as TierRank) : undefined;
}

const RANK: Record<TierRank, number> = { S: 0, A: 1, B: 2, C: 3 };

/** What CommunityDragon says about one augment, already turned into display values. */
export type AugmentInfo = {
  name: string;
  rarity: AugmentRarity | undefined;
  iconUrl: string | null;
  description: string | null;
};

export type AugmentEntry = {
  apiName: string;
  name: string;
  rarity: AugmentRarity;
  tier: TierRank;
  iconUrl: string | null;
  description: string | null;
};

export type AugmentSkip = { apiName: string; reason: string };

/**
 * The graded list resolved against CommunityDragon: best tier first, the author's own
 * order inside a tier. An augment graded twice keeps its best grade. One CommunityDragon
 * does not know — an augment newer than the pinned game data — or one with no rarity
 * tag is skipped and reported, never guessed at.
 */
export function resolveAugmentTiers(
  tiers: readonly { label: string; ids: readonly string[] }[],
  info: ReadonlyMap<string, AugmentInfo>,
): { entries: AugmentEntry[]; skipped: AugmentSkip[] } {
  const skipped: AugmentSkip[] = [];
  const graded = tiers.flatMap((row) => {
    const tier = feedTier(row.label);
    if (!tier) {
      skipped.push(...row.ids.map((apiName) => ({ apiName, reason: `unknown grade "${row.label}"` })));
      return [];
    }
    return [{ tier, ids: row.ids }];
  });
  // Stable, so the author's order survives inside a tier and between two D-and-C rows.
  graded.sort((a, b) => RANK[a.tier] - RANK[b.tier]);

  const entries: AugmentEntry[] = [];
  const seen = new Set<string>();
  for (const { tier, ids } of graded) {
    for (const apiName of ids) {
      if (seen.has(apiName)) continue;
      seen.add(apiName);
      const augment = info.get(apiName);
      if (!augment) {
        skipped.push({ apiName, reason: "not in the CommunityDragon game data" });
        continue;
      }
      if (!augment.rarity) {
        skipped.push({ apiName, reason: "no rarity tag" });
        continue;
      }
      entries.push({ apiName, tier, ...augment, rarity: augment.rarity });
    }
  }
  return { entries, skipped };
}

/**
 * "Glass Cannon" at Silver and at Gold, "Branching Out" and "Branching Out+",
 * "Celestial Blessing I" and "II": one augment at different rarities. A comp's picks
 * show one of each, since offering both tells the reader nothing new.
 */
export function augmentFamily(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s*(?:\+{1,3}|\b(?:i{1,3}|iv)\b)$/, "")
    .trim();
}

/** Where a guide that does not grade an augment at all puts it: below every grade. */
const UNGRADED = 4;

type Guide = { source: string | null; augments: readonly { id: string; tier: string }[] };

/**
 * Each augment's average rank across MetaTFT's **distinct** comp guides: S 0 … C 3,
 * and 4 from a guide that does not grade it. Guides are deduplicated by title first,
 * because MetaTFT hands one guide to several clusters, and counting every copy would
 * let the most-shared guide decide what "usual" means.
 */
export function guideConsensus(guides: Iterable<Guide>): Map<string, number> {
  const distinct = new Map<string, Map<string, number>>();
  for (const guide of guides) {
    const ranks = new Map<string, number>();
    for (const row of guide.augments) {
      const tier = feedTier(row.tier);
      if (tier) ranks.set(row.id, Math.min(ranks.get(row.id) ?? UNGRADED, RANK[tier]));
    }
    distinct.set(guide.source ?? JSON.stringify([...ranks]), ranks);
  }

  const consensus = new Map<string, number>();
  for (const id of new Set([...distinct.values()].flatMap((ranks) => [...ranks.keys()]))) {
    let sum = 0;
    for (const ranks of distinct.values()) sum += ranks.get(id) ?? UNGRADED;
    consensus.set(id, sum / distinct.size);
  }
  return consensus;
}

/**
 * A comp's best augments, from the grades of the guide MetaTFT matched to it.
 *
 * **Ranking.** The comp's own grade, best first; then how much **higher** this guide
 * rates an augment than the guides do on average (`guideConsensus`) — that gap is the
 * synergy the section is for. Nearly every guide grades the same econ augments S, so
 * an augment every comp wants is not advice about this one; ranked against MetaTFT's
 * global list instead, "Feeling Lucky" led seven comps of nine on patch 18.2, because
 * that only measured where two lists disagree. Then the global tier, then the guide's
 * own order. Only augments on the global list can be shown (it is where names and
 * icons come from), one per family.
 *
 * **Rarity balance.** Picks are taken round-robin Silver → Gold → Prismatic, each the
 * best-ranked of its rarity not yet taken, and a rarity that runs out is skipped so the
 * others fill its slots. Ranked straight down instead, a guide's picks were whatever
 * rarity it happened to grade most S's in: six Silvers for one comp, four Prismatics for
 * another, while a game offers one augment of each. A guide that grades a single rarity
 * (the Draven and Ashe guides grade only Silver) still yields only that rarity — the
 * picks stay this guide's grades rather than being padded from the global list.
 * The result lists Silver, then Gold, then Prismatic, best-ranked first inside each.
 *
 * Null under `min`: a guide grading two augments is a stub, not a recommendation.
 */
export function pickCompAugments(
  graded: readonly { id: string; tier: string }[],
  global: ReadonlyMap<string, AugmentEntry>,
  consensus: ReadonlyMap<string, number>,
  limits: { min: number; max: number } = COMP_AUGMENTS,
): string[] | null {
  const candidates = graded.flatMap((row, index) => {
    const tier = feedTier(row.tier);
    const entry = global.get(row.id);
    if (!tier || !entry) return [];
    // An augment missing from the consensus has nothing to stand out from.
    return [{ entry, rank: RANK[tier], lift: (consensus.get(row.id) ?? RANK[tier]) - RANK[tier], index }];
  });
  candidates.sort(
    (a, b) => a.rank - b.rank || b.lift - a.lift || RANK[a.entry.tier] - RANK[b.entry.tier] || a.index - b.index,
  );

  const queues = new Map(AUGMENT_RARITIES.map((rarity) => [rarity, candidates.filter((c) => c.entry.rarity === rarity)]));
  const picked: { entry: AugmentEntry; order: number }[] = [];
  const families = new Set<string>();
  let order = 0;
  for (let progress = true; progress && picked.length < limits.max; ) {
    progress = false;
    for (const rarity of AUGMENT_RARITIES) {
      if (picked.length === limits.max) break;
      const queue = queues.get(rarity) ?? [];
      // The next of this rarity whose family has not been shown; a spent queue is skipped.
      while (queue.length) {
        const { entry } = queue.shift()!;
        const family = augmentFamily(entry.name);
        if (families.has(family)) continue;
        families.add(family);
        picked.push({ entry, order: order++ });
        progress = true;
        break;
      }
    }
  }
  if (picked.length < limits.min) return null;
  const rarityRank = (rarity: AugmentRarity) => AUGMENT_RARITIES.indexOf(rarity);
  return picked
    .sort((a, b) => rarityRank(a.entry.rarity) - rarityRank(b.entry.rarity) || a.order - b.order)
    .map(({ entry }) => entry.apiName);
}

const normalizeName = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * The carries a MetaTFT guide title names, from the part before the first ">":
 * "ZYRA & SORAKA > Executioner > Lvl 8 push" → `[["zyra"], ["soraka"]]`, and
 * "CINDERLING / PEBBLES > Riftbeast" → `[["cinderling", "pebbles"]]`. Every "&"
 * group is required; "/" offers alternatives. Empty for a title with no carry part.
 */
export function guideCarries(source: string | null): string[][] {
  const head = source?.split(">")[0] ?? "";
  return head
    .split("&")
    .map((group) => group.split("/").map(normalizeName).filter(Boolean))
    .filter((group) => group.length > 0);
}

/**
 * Whether a guide is about this board: every carry its title names is fielded.
 *
 * MetaTFT hands each comp cluster its **nearest** guide, however far away — on patch
 * 18.2 Executioner Malphite and Blossom Sett Sivir both inherited the "AHRI & Morgana"
 * guide — so without this check a comp page would recommend another comp's augments.
 * A carry is a name a reader can verify, which a distance cutoff is not. A guide with
 * no title names nothing, so it fits nothing.
 */
export function guideFitsBoard(source: string | null, boardNames: Iterable<string>): boolean {
  const carries = guideCarries(source);
  if (carries.length === 0) return false;
  const fielded = new Set([...boardNames].map(normalizeName));
  return carries.every((group) => group.some((name) => fielded.has(name)));
}

/**
 * The trait a guide title names, the segment after the first ">":
 * "SIVIR > Hunter > Lvl 8 push" → "hunter". Undefined when there is none.
 */
export function guideTrait(source: string | null): string | undefined {
  const trait = normalizeName(source?.split(">")[1] ?? "");
  return trait || undefined;
}

type TitledGuide = { source: string | null; augments: readonly { id: string; tier: string }[] };

/**
 * A guide for a comp whose own cluster has none that fits: another of MetaTFT's guides
 * that names this comp **twice over** — every carry in its title is fielded
 * (`guideFitsBoard`) *and* the trait in its title is one the comp is **defined by**
 * (the traits its name is built from, `compTraitNames`).
 *
 * Stricter than the cluster's own guide on purpose. MetaTFT chose that one for this
 * comp, however loosely; this one is chosen by us, and a carry alone is too weak a tie.
 * Merely *active* was tried first and was still too weak: on patch 18.2 Fae Rengar and
 * Blossom Sett Sivir both field Sivir with a small Hunter bonus, and both adopted
 * "SIVIR > Hunter" — the Hunter comp's augments on two comps that are not it. A title
 * whose trait segment is not a real trait ("Legendaries", "Solar") never qualifies.
 *
 * Among several, the guide naming more carries wins (it is the more specific), then the
 * one grading more augments, then the title, so the same feed always picks the same one.
 */
export function pickFallbackGuide<G extends TitledGuide>(
  guides: Iterable<G>,
  boardNames: readonly string[],
  compTraitNames: readonly string[],
): G | undefined {
  const active = new Set(compTraitNames.map(normalizeName));
  const distinct = new Map<string, G>();
  for (const guide of guides) if (guide.source && !distinct.has(guide.source)) distinct.set(guide.source, guide);
  return [...distinct.values()]
    .filter((guide) => {
      const trait = guideTrait(guide.source);
      return trait !== undefined && active.has(trait) && guideFitsBoard(guide.source, boardNames);
    })
    .sort(
      (a, b) =>
        guideCarries(b.source).length - guideCarries(a.source).length ||
        b.augments.length - a.augments.length ||
        (a.source ?? "").localeCompare(b.source ?? ""),
    )[0];
}

export type CompAugmentPicks = { slug: string; source: string | null; augments: string[] };

export type AugmentTiersSource = {
  patch: string;
  /** One line printed under the page title. */
  source: string;
  /** Comment lines under the GENERATED marker. */
  provenance: string[];
  entries: AugmentEntry[];
  comps: CompAugmentPicks[];
};

const GENERATED_WARNING = [
  "GENERATED by `pnpm sync:meta` from MetaTFT's augment grades — do not edit by hand.",
  "The next sync rewrites this file.",
];

export function buildAugmentTiersYaml(source: AugmentTiersSource): string {
  const comps = [...source.comps].sort((a, b) => a.slug.localeCompare(b.slug));
  const doc = new Document({
    patch: source.patch,
    source: source.source,
    augments: source.entries.map((entry) => ({
      api_name: entry.apiName,
      name: entry.name,
      rarity: entry.rarity,
      tier: entry.tier,
      icon_url: entry.iconUrl,
      ...(entry.description ? { description: entry.description } : {}),
    })),
    comps: Object.fromEntries(
      comps.map((comp) => [comp.slug, { ...(comp.source ? { source: comp.source } : {}), augments: comp.augments }]),
    ),
  });
  // Six api names read better on one line than as six.
  for (const comp of comps) {
    const node = doc.getIn(["comps", comp.slug, "augments"], true);
    if (isSeq(node)) node.flow = true;
  }

  const header = [...GENERATED_WARNING, "", ...source.provenance]
    .map((line) => (line ? `# ${line}` : "#"))
    .join("\n");
  return `${header}\n${doc.toString({ lineWidth: 0 })}`;
}

/**
 * Everything but `source`, which quotes MetaTFT's update time and so moves on every
 * run — comparing file text would rewrite the file daily with nothing changed.
 * Undefined for text that does not parse, which always counts as a change.
 */
export function augmentTiersFingerprint(text: string): string | undefined {
  let data: unknown;
  try {
    data = parse(text);
  } catch {
    return undefined;
  }
  if (typeof data !== "object" || data === null) return undefined;
  const ratings: Record<string, unknown> = { ...data };
  delete ratings.source;
  return JSON.stringify(ratings);
}
