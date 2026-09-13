import { Document, parse } from "yaml";
import { BIS_PRIMARY_ITEMS, BIS_SECONDARY_ITEMS, BIS_SPECIAL_ITEMS, type BisRole } from "./schemas";
import { averagePlacement, totalGames, type Placements } from "./meta-sync";

/**
 * Pure: MetaTFT `unit_detail` rows → one champion's best-in-slot build
 * (architecture §7.4). `scripts/sync-bis.ts` supplies the feed and the static
 * tables; everything that decides *which* build is BIS lives here, where it can
 * be tested without the network.
 */

/** One row of the feed's `builds`, already split into api names. */
export type BuildRow = { items: string[]; places: Placements };
/** One row of the feed's `items`: how the champion placed holding that item at all. */
export type ItemRow = { apiName: string; places: Placements };

/** What the champion's own static row and the item table say, for one champion. */
export type BisItemInfo = {
  /** `items.kind`; only real completed items can be a BIS. */
  kind: string;
  /** `items.components`, which is what the role is read from. */
  components: readonly string[];
};

export type BisThresholds = {
  /** Games a 3-item build needs before its average means anything. */
  minBuildGames: number;
  /** Games a single item needs to be offered as an alternative. */
  minItemGames: number;
  /** Games an artifact or radiant needs — lower, because they only drop a few times a game. */
  minSpecialGames: number;
};

export const DEFAULT_THRESHOLDS: BisThresholds = { minBuildGames: 200, minItemGames: 500, minSpecialGames: 100 };

/**
 * Item kinds a build may be made of — **completed items only**, which is narrower
 * than what the feed reports and deliberately so. A BIS answers "what do I build
 * out of components?", and only a completed item answers it:
 *
 * - **Emblems** are a trait slot, not an item choice. Including them would make
 *   "BIS" mean "whatever the comp that ran this unit happened to need".
 * - **Artifacts** and **radiants** cannot be built on demand — they come from an
 *   anvil or an augment. Left in, they dominated the ranking (they are rare, so the
 *   boards holding them are boards that were already winning) and produced builds
 *   nobody can copy. They also have no components, which left the role unreadable.
 */
export const BUILDABLE_KINDS = new Set(["completed"]);

/**
 * The kinds that are kept out of a build but still worth knowing per champion: what to
 * take from an anvil or a radiant armory when one is offered. They are ranked only
 * against each other, in their own group, so the bias that let them dominate a build
 * (the boards holding them were already winning) applies to every candidate alike.
 */
export const SPECIAL_KINDS = new Set(["artifact", "radiant"]);

/** Components that say what a build is for. Sparring Gloves and Spatula say nothing. */
const AD_COMPONENTS = new Set(["DA_Component_BFSword", "DA_Component_RecurveBow"]);
const AP_COMPONENTS = new Set(["DA_Component_NeedlesslyLargeRod", "DA_Component_TearOfTheGoddess"]);
const TANK_COMPONENTS = new Set([
  "DA_Component_ChainVest",
  "DA_Component_NegatronCloak",
  "DA_Component_GiantsBelt",
]);

/** Four of a build's six components being defensive makes it a tank's build. */
const MAIN_TANK_COMPONENTS = 4;

/**
 * The role a build implies, from the components of its three items.
 *
 * Read off the recipe rather than the champion: a unit's *class* is a fact about
 * the game, but what you build on it is a fact about this patch, and the recipe is
 * the only place the two meet. Two Chain Vests and a Negatron Cloak is a tank's
 * build whoever is holding it.
 *
 * **A damage component outranks a defensive one on a tie**, which is the rule that
 * matters in practice: Edge of Night + Infinity Edge + Quicksilver is two offensive
 * and two defensive components, and it is still an AD carry's build — a carry with a
 * defensive item is a carry. Only a build that is defensive outright, or mixes AD and
 * AP evenly, falls through to Utility / Bruiser. Sparring Gloves and Spatula count
 * for nothing on purpose: they say what an item *costs*, not what it does.
 */
export function classifyRole(components: readonly string[]): BisRole {
  let ad = 0;
  let ap = 0;
  let tank = 0;
  for (const component of components) {
    if (AD_COMPONENTS.has(component)) ad++;
    else if (AP_COMPONENTS.has(component)) ap++;
    else if (TANK_COMPONENTS.has(component)) tank++;
  }
  if (tank >= MAIN_TANK_COMPONENTS) return "Main Tank";

  const damage = Math.max(ad, ap);
  if (damage === 0 || damage < tank || ad === ap) return "Utility / Bruiser";
  return ad > ap ? "AD Carry" : "AP Carry";
}

export type BisBuild = {
  primary: string[];
  secondary: string[];
  /** Best-placing artifacts and radiants, best first. May be empty. */
  special: string[];
  role: BisRole;
  avgPlace: number;
  games: number;
};

/** A champion the feed could not support a build for, and why. */
export type BisSkip = { apiName: string; reason: string };

/**
 * The best-in-slot build for one champion, or why there isn't one.
 *
 * **Primary** is the full 3-item build with the best average placement that clears
 * the games floor — not the most-played one. Most-played measures what people
 * default to; this page is asked what actually wins.
 *
 * **Secondary** is the best single items the champion held that the primary build
 * doesn't already contain, which is what "flex" means in practice: the slot you
 * change when you can't find the third component.
 *
 * **Special** is the best artifacts and radiants the champion held, over their own
 * lower floor. It never decides whether a champion gets a row: a unit nobody hands an
 * artifact still has a build.
 */
export function deriveBis(input: {
  apiName: string;
  builds: readonly BuildRow[];
  items: readonly ItemRow[];
  /** `api_name` → static row. An item missing here is unknown and never used. */
  itemInfo: ReadonlyMap<string, BisItemInfo>;
  thresholds?: BisThresholds;
}): { build?: BisBuild; skip?: BisSkip } {
  const { apiName, itemInfo } = input;
  const { minBuildGames, minItemGames, minSpecialGames } = { ...DEFAULT_THRESHOLDS, ...input.thresholds };
  const buildable = (item: string) => BUILDABLE_KINDS.has(itemInfo.get(item)?.kind ?? "");
  const special = (item: string) => SPECIAL_KINDS.has(itemInfo.get(item)?.kind ?? "");

  /** The best-placing single items that pass `keep` and the games floor, best first. */
  const bestItems = (keep: (item: string) => boolean, minGames: number, max: number) =>
    input.items
      .flatMap((row) => {
        if (!keep(row.apiName)) return [];
        const games = totalGames(row.places);
        const avgPlace = averagePlacement(row.places);
        if (avgPlace === undefined || games < minGames) return [];
        return [{ apiName: row.apiName, games, avgPlace }];
      })
      .sort((a, b) => a.avgPlace - b.avgPlace || b.games - a.games)
      .slice(0, max)
      .map((row) => row.apiName);

  const ranked = input.builds
    .flatMap((row) => {
      if (row.items.length !== BIS_PRIMARY_ITEMS || !row.items.every(buildable)) return [];
      const games = totalGames(row.places);
      const avgPlace = averagePlacement(row.places);
      if (avgPlace === undefined || games < minBuildGames) return [];
      return [{ items: row.items, games, avgPlace }];
    })
    // Average placement first; games break the tie, so the better-evidenced build wins.
    .sort((a, b) => a.avgPlace - b.avgPlace || b.games - a.games);

  const best = ranked[0];
  if (!best) {
    return {
      skip: {
        apiName,
        reason: `no 3-item build reached ${minBuildGames} games`,
      },
    };
  }

  const held = new Set(best.items);
  const secondary = bestItems((item) => !held.has(item) && buildable(item), minItemGames, BIS_SECONDARY_ITEMS.max);

  if (secondary.length < BIS_SECONDARY_ITEMS.min) {
    return {
      skip: {
        apiName,
        reason: `only ${secondary.length} alternative item(s) reached ${minItemGames} games`,
      },
    };
  }

  const components = best.items.flatMap((item) => [...(itemInfo.get(item)?.components ?? [])]);
  return {
    build: {
      primary: best.items,
      secondary,
      special: bestItems(special, minSpecialGames, BIS_SPECIAL_ITEMS),
      role: classifyRole(components),
      avgPlace: Math.round(best.avgPlace * 100) / 100,
      games: best.games,
    },
  };
}

/** `sync:bis` sorts the file this way: cheapest first, then by name, like the shop. */
export function compareChampions(
  a: { cost: number; name: string },
  b: { cost: number; name: string },
): number {
  return a.cost - b.cost || a.name.localeCompare(b.name);
}

// ─── Writing the file ───────────────────────────────────────────────────────

const GENERATED_WARNING = [
  "GENERATED by `pnpm sync:bis`. Hand edits are overwritten on the next sync —",
  "change the script, or the numbers it reads, rather than this file.",
  "`notes:` is the exception: it is carried across syncs, so guidance survives.",
];

export type BisEntry = BisBuild & { apiName: string; note?: string };

export type BisSource = {
  patch: string;
  /** Cheapest first, then by name. */
  entries: readonly BisEntry[];
  /** Lines describing where the numbers came from; each becomes a header comment. */
  provenance: readonly string[];
};

/**
 * The generated `champion-bis.yaml`. Mirrors `buildTierListYaml`: the same warning
 * header, the same "notes are carried, everything else is measured" split, and the
 * same `lineWidth: 0` so a note stays on one line.
 */
export function buildChampionBisYaml(source: BisSource): string {
  const doc = new Document({
    patch: source.patch,
    source: source.provenance[0] ?? "",
    champions: source.entries.map((entry) => ({
      api_name: entry.apiName,
      role: entry.role,
      primary_bis: entry.primary,
      secondary_bis: entry.secondary,
      ...(entry.special.length ? { special_bis: entry.special } : {}),
      avg_place: entry.avgPlace,
      games: entry.games,
      ...(entry.note ? { notes: entry.note } : {}),
    })),
  });

  const header = [...GENERATED_WARNING, "", ...source.provenance]
    .map((line) => (line ? `# ${line}` : "#"))
    .join("\n");
  return `${header}\n${doc.toString({ lineWidth: 0 })}`;
}

/**
 * The hand-written `notes` in an existing file, keyed by `api_name`, so a sync can
 * put them back. Tolerant by design — a file that no longer parses should cost the
 * notes, not the run, and the run is about to overwrite it anyway.
 */
export function readExistingBisNotes(text: string): Record<string, string> {
  let data: unknown;
  try {
    data = parse(text);
  } catch {
    return {};
  }
  if (typeof data !== "object" || data === null) return {};
  const champions = (data as Record<string, unknown>).champions;
  if (!Array.isArray(champions)) return {};

  const notes: Record<string, string> = {};
  for (const row of champions) {
    if (typeof row !== "object" || row === null) continue;
    const { api_name: apiName, notes: note } = row as Record<string, unknown>;
    if (typeof apiName === "string" && typeof note === "string" && note.trim()) notes[apiName] = note;
  }
  return notes;
}

/** What changed, for the `--dry-run` report and for "write only when it moved". */
export type BisChange =
  | { kind: "added"; apiName: string; role: BisRole }
  | { kind: "changed"; apiName: string; from: string; to: string }
  | { kind: "removed"; apiName: string };

/** Compares two sets of entries by the fields a reader would notice. */
export function diffBis(
  before: readonly BisEntry[],
  after: readonly BisEntry[],
): BisChange[] {
  const signature = (entry: BisEntry) =>
    [...entry.primary, "|", ...entry.secondary, "|", ...entry.special].join(",");
  const old = new Map(before.map((entry) => [entry.apiName, entry]));
  const changes: BisChange[] = [];

  for (const entry of after) {
    const previous = old.get(entry.apiName);
    if (!previous) changes.push({ kind: "added", apiName: entry.apiName, role: entry.role });
    else if (signature(previous) !== signature(entry)) {
      changes.push({ kind: "changed", apiName: entry.apiName, from: signature(previous), to: signature(entry) });
    }
    old.delete(entry.apiName);
  }
  for (const apiName of old.keys()) changes.push({ kind: "removed", apiName });
  return changes;
}
