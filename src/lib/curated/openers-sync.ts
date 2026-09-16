import { Document } from "yaml";
import type { TierRank } from "@/lib/static/game";
import { OPENER_COSTS, OPENER_ITEMS, OPENER_PIVOTS, OPENER_UNITS, type OpenerTier } from "./schemas";
import type { Opener } from "./opener-validation";

/**
 * Pure: Derives stage-2 opener boards from meta comp clusters (architecture §7, §8).
 * Clusters comps by their `early_units`, aggregates play rates, identifies slammable
 * items from carry builds, and links viable transition comps.
 */

export type OpenerCompData = {
  slug: string;
  name: string;
  tier: TierRank;
  pickRate?: number;
  avgPlace?: number;
  earlyUnits: string[];
  carries: { apiName: string; priority?: number; items: string[] }[];
};

export type OpenerReferenceData = {
  championNames: Map<string, string>;
  championCosts: Map<string, number>;
  championTraits: Map<string, readonly string[]>;
  traitNames: Map<string, string>;
  itemNames: Map<string, string>;
  itemKinds?: Map<string, string>;
};

export type OpenerCluster = {
  coreUnits: string[];
  comps: OpenerCompData[];
  totalPickRate: number;
  bestTier: TierRank;
  avgPlace: number;
};

const TIER_ORDER: Record<TierRank, number> = { S: 0, A: 1, B: 2, C: 3 };

/** Groups comps by identical 1- and 2-cost early units. */
export function clusterEarlyComps(
  comps: readonly OpenerCompData[],
  references: OpenerReferenceData,
): OpenerCluster[] {
  const groups = new Map<string, { coreUnits: string[]; comps: OpenerCompData[] }>();

  for (const comp of comps) {
    if (!comp.earlyUnits || comp.earlyUnits.length < OPENER_UNITS.min) continue;

    // Filter to valid 1- and 2-cost units
    const validUnits = comp.earlyUnits
      .filter((apiName) => {
        const cost = references.championCosts.get(apiName);
        return cost !== undefined && (OPENER_COSTS as readonly number[]).includes(cost);
      })
      .slice(0, OPENER_UNITS.max);

    if (validUnits.length < OPENER_UNITS.min) continue;

    // Stable key sorted alphabetically
    const sortedKey = [...validUnits].sort().join(",");
    const existing = groups.get(sortedKey);
    if (existing) {
      existing.comps.push(comp);
    } else {
      groups.set(sortedKey, { coreUnits: validUnits, comps: [comp] });
    }
  }

  const clusters: OpenerCluster[] = [];
  for (const group of groups.values()) {
    const totalPickRate = group.comps.reduce((sum, c) => sum + (c.pickRate ?? 0), 0);
    const avgPlace =
      group.comps.reduce((sum, c) => sum + (c.avgPlace ?? 4.5), 0) / Math.max(1, group.comps.length);

    let bestTier: TierRank = "C";
    for (const comp of group.comps) {
      if (TIER_ORDER[comp.tier] < TIER_ORDER[bestTier]) {
        bestTier = comp.tier;
      }
    }

    clusters.push({
      coreUnits: group.coreUnits,
      comps: group.comps,
      totalPickRate,
      bestTier,
      avgPlace,
    });
  }

  // Sort clusters by bestTier first, then totalPickRate descending
  clusters.sort((a, b) => {
    const tierDiff = TIER_ORDER[a.bestTier] - TIER_ORDER[b.bestTier];
    if (tierDiff !== 0) return tierDiff;
    return b.totalPickRate - a.totalPickRate;
  });

  return clusters;
}

/** Computes a descriptive name for the opener board based on shared traits. */
export function deriveOpenerName(units: readonly string[], references: OpenerReferenceData): string {
  const traitCounts = new Map<string, number>();

  for (const unit of units) {
    const traits = references.championTraits.get(unit) ?? [];
    for (const trait of traits) {
      traitCounts.set(trait, (traitCounts.get(trait) ?? 0) + 1);
    }
  }

  // Find traits with >= 2 units, sorted by count descending
  const activeTraits = Array.from(traitCounts.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1]);

  if (activeTraits.length >= 2) {
    const t1 = references.traitNames.get(activeTraits[0]![0]) ?? activeTraits[0]![0];
    const t2 = references.traitNames.get(activeTraits[1]![0]) ?? activeTraits[1]![0];
    const suffix = t2.endsWith("s") || t2.endsWith("er") ? (t2.endsWith("s") ? t2 : `${t2}s`) : `${t2}s`;
    return `${t1} ${suffix}`;
  }

  if (activeTraits.length === 1) {
    const t1 = references.traitNames.get(activeTraits[0]![0]) ?? activeTraits[0]![0];
    const count = activeTraits[0]![1];
    if (count >= 3) {
      return `${t1} Swarm`;
    }
    return `${t1} Core`;
  }

  // Fallback to highest cost unit's name
  const leadUnit = [...units].sort(
    (a, b) => (references.championCosts.get(b) ?? 0) - (references.championCosts.get(a) ?? 0),
  )[0];
  const name = leadUnit ? references.championNames.get(leadUnit) : "Early";
  return `${name ?? "Early"} Board`;
}

/** Assigns S, A, or B tier based on cluster rank and power. */
export function deriveOpenerTier(index: number, cluster: OpenerCluster): OpenerTier {
  if (index < 3 && (cluster.bestTier === "S" || cluster.totalPickRate >= 20)) {
    return "S";
  }
  if (index < 6 || cluster.bestTier === "A") {
    return "A";
  }
  return "B";
}

/** Derives the most universal completed items built on carries that pivot from this opener. */
export function deriveSlammableItems(
  cluster: OpenerCluster,
  references: OpenerReferenceData,
): string[] {
  const itemCounts = new Map<string, number>();

  // Gather items from carries of member comps
  for (const comp of cluster.comps) {
    for (const carry of comp.carries) {
      for (const item of carry.items) {
        // Skip components, emblems, artifacts
        const kind = references.itemKinds?.get(item);
        if (kind && kind !== "completed") continue;
        itemCounts.set(item, (itemCounts.get(item) ?? 0) + (carry.priority === 1 ? 2 : 1));
      }
    }
  }

  // Sort by popularity
  const sorted = Array.from(itemCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([item]) => item);

  if (sorted.length >= OPENER_ITEMS.min) {
    return sorted.slice(0, OPENER_ITEMS.max);
  }

  // Common versatile fallback items if cluster comps had few completed items
  const fallbacks = ["DA_SunfireCape", "DA_GuinsoosRageblade", "DA_WarmogsArmor", "DA_SteadfastHeart"];
  for (const fb of fallbacks) {
    if (!sorted.includes(fb)) {
      sorted.push(fb);
      if (sorted.length >= OPENER_ITEMS.max) break;
    }
  }

  return sorted.slice(0, OPENER_ITEMS.max);
}

/** Selects 2–3 published comp slugs to pivot into. */
export function deriveTransitionSlugs(
  cluster: OpenerCluster,
  allComps?: readonly OpenerCompData[],
): string[] {
  // Sort member comps by tier (S > A > B) then pick rate
  const sorted = [...cluster.comps].sort((a, b) => {
    const tierDiff = TIER_ORDER[a.tier] - TIER_ORDER[b.tier];
    if (tierDiff !== 0) return tierDiff;
    return (b.pickRate ?? 0) - (a.pickRate ?? 0);
  });

  const slugs = sorted.map((c) => c.slug);

  // If fewer than min, look for other comps sharing at least 2 units
  if (slugs.length < OPENER_PIVOTS.min && allComps) {
    for (const comp of allComps) {
      if (slugs.includes(comp.slug)) continue;
      const shared = comp.earlyUnits.filter((u) => cluster.coreUnits.includes(u)).length;
      if (shared >= 2) {
        slugs.push(comp.slug);
        if (slugs.length >= OPENER_PIVOTS.max) break;
      }
    }
  }

  // If still fewer than min, backfill with top tier comps from allComps
  if (slugs.length < OPENER_PIVOTS.min && allComps) {
    const fallbackComps = [...allComps]
      .filter((c) => !slugs.includes(c.slug))
      .sort((a, b) => {
        const tierDiff = TIER_ORDER[a.tier] - TIER_ORDER[b.tier];
        if (tierDiff !== 0) return tierDiff;
        return (b.pickRate ?? 0) - (a.pickRate ?? 0);
      });
    for (const comp of fallbackComps) {
      slugs.push(comp.slug);
      if (slugs.length >= OPENER_PIVOTS.min) break;
    }
  }

  return slugs.slice(0, OPENER_PIVOTS.max);
}

const TANK_TRAITS = new Set([
  "vanguard", "brawler", "warden", "defender", "juggernaut", "bruiser",
  "guardian", "bastion", "behemoth", "knight", "colossus",
]);

const DAMAGE_TRAITS = new Set([
  "invoker", "rapidfire", "hunter", "sniper", "executioner", "sorcerer",
  "mage", "gunslinger", "deadeye", "quickdraw", "duelist", "blaster",
  "assassin", "trickshot", "arcanist", "striker",
]);

/** Generates concise play advice under 96 chars. */
export function deriveOpenerNotes(
  cluster: OpenerCluster,
  references: OpenerReferenceData,
  topPivotName?: string,
): string {
  const scoredUnits = cluster.coreUnits.map((apiName) => {
    let carryScore = 0;
    let tankScore = 0;

    const traits = references.championTraits.get(apiName) ?? [];
    for (const trait of traits) {
      const tLower = (references.traitNames.get(trait) ?? trait).toLowerCase();
      if (DAMAGE_TRAITS.has(tLower)) carryScore += 2;
      if (TANK_TRAITS.has(tLower)) tankScore += 2;
    }

    for (const comp of cluster.comps) {
      if (comp.carries.some((c) => c.apiName === apiName)) {
        carryScore += 3;
      }
    }

    const cost = references.championCosts.get(apiName) ?? 1;
    carryScore += cost * 0.1;
    tankScore += cost * 0.05;

    return { apiName, carryScore, tankScore };
  });

  const bestCarryUnit = [...scoredUnits].sort((a, b) => b.carryScore - a.carryScore)[0]?.apiName;
  const bestTankUnit = [...scoredUnits]
    .filter((u) => u.apiName !== bestCarryUnit)
    .sort((a, b) => b.tankScore - a.tankScore)[0]?.apiName;

  const carryName = bestCarryUnit ? (references.championNames.get(bestCarryUnit) ?? "Backline") : "Backline";
  const tankName = bestTankUnit ? (references.championNames.get(bestTankUnit) ?? "Frontline") : "Frontline";

  const target = topPivotName ? ` Pivot toward ${topPivotName}.` : "";
  const advice = `${carryName} holds items while ${tankName} anchors the frontline.${target}`;

  if (advice.length <= 96) return advice;
  return `${carryName} carries with ${tankName} frontline.${target}`.slice(0, 96);
}

/** Pure: transforms comp clusters into full Opener objects. */
export function deriveOpeners(
  comps: readonly OpenerCompData[],
  references: OpenerReferenceData,
  patch: string,
  maxOpeners = 8,
): Opener[] {
  const clusters = clusterEarlyComps(comps, references);
  const selectedClusters = clusters.slice(0, maxOpeners);

  return selectedClusters.map((cluster, i) => {
    const name = deriveOpenerName(cluster.coreUnits, references);
    const tier = deriveOpenerTier(i, cluster);
    const slammableItems = deriveSlammableItems(cluster, references);
    const transitionSlugs = deriveTransitionSlugs(cluster, comps);
    const topPivot = cluster.comps[0]?.name;
    const notes = deriveOpenerNotes(cluster, references, topPivot);

    const units = cluster.coreUnits.map((apiName) => ({
      apiName,
      name: references.championNames.get(apiName) ?? apiName,
      cost: references.championCosts.get(apiName) ?? 1,
      iconUrl: null,
    }));

    const items = slammableItems.map((apiName) => ({
      apiName,
      name: references.itemNames.get(apiName) ?? apiName,
      iconUrl: null,
    }));

    const pivots = transitionSlugs.map((slug) => {
      const comp = comps.find((c) => c.slug === slug);
      return {
        slug,
        name: comp?.name ?? slug,
        tier: (comp?.tier ?? "A") as TierRank,
      };
    });

    return {
      name,
      tier,
      units,
      items,
      pivots,
      notes,
    };
  });
}

/** Formats derived openers into YAML text. */
export function buildOpenersYaml(input: { patch: string; openers: Opener[] }): string {
  const doc = new Document({
    patch: input.patch,
    title: "Early openers & item slams",
    openers: input.openers.map((o) => ({
      name: o.name,
      tier: o.tier,
      core_units: o.units.map((u) => u.apiName),
      slammable_items: o.items.map((i) => i.apiName),
      transition_to: o.pivots.map((p) => p.slug),
      notes: o.notes,
    })),
  });

  const header = [
    "Stage-2 opener boards and the items worth slamming on them.",
    "GENERATED by `pnpm sync:openers` from MetaTFT comp clusters.",
    "Every unit, item, and pivot comp slug is validated during build.",
  ]
    .map((line) => (line ? `# ${line}` : "#"))
    .join("\n");

  return `${header}\n\n${doc.toString({ lineWidth: 0 })}`;
}
