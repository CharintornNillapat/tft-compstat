import type { TierRank } from "@/lib/static/game";
import { augmentTiersFileSchema, type AugmentRarity } from "./schemas";
import { parseYaml, type SeedIssue } from "./validate";

/**
 * The generated augment file, parsed (architecture §7.5, §8). Pure and shared: the
 * site runs it at build time and `sync:meta` runs it on the text it is about to
 * write, so the two can never disagree about what a valid file is.
 */

export type Augment = {
  apiName: string;
  name: string;
  rarity: AugmentRarity;
  tier: TierRank;
  iconUrl: string | null;
  description: string | null;
};

export type CompAugments = {
  /** The guide MetaTFT took the grades from. */
  source: string | null;
  /** Silver, then Gold, then Prismatic; best first inside each (§7.5). */
  augments: Augment[];
};

export type AugmentTiers = {
  patch: string;
  title: string;
  source: string | null;
  /** Best tier first, the author's order inside a tier. */
  augments: Augment[];
  comps: Record<string, CompAugments>;
};

/**
 * YAML text → augments, or every issue that stopped it, with `file:line:col`. Beyond
 * the schema: no augment is listed twice, and a comp only names listed augments, once.
 */
export function parseAugmentTiers(file: string, text: string): { tiers?: AugmentTiers; issues: SeedIssue[] } {
  const yaml = parseYaml(file, text);
  if (yaml.syntaxIssues.length) return { issues: yaml.syntaxIssues };

  const parsed = augmentTiersFileSchema.safeParse(yaml.data);
  if (!parsed.success) {
    return { issues: parsed.error.issues.map((issue) => yaml.issue(issue.path, issue.message)) };
  }
  const data = parsed.data;
  const issues: SeedIssue[] = [];

  const byApiName = new Map<string, Augment>();
  data.augments.forEach((row, index) => {
    if (byApiName.has(row.api_name)) {
      issues.push(yaml.issue(["augments", index, "api_name"], `${row.api_name} is listed more than once`));
      return;
    }
    byApiName.set(row.api_name, {
      apiName: row.api_name,
      name: row.name,
      rarity: row.rarity,
      tier: row.tier,
      iconUrl: row.icon_url,
      description: row.description ?? null,
    });
  });

  const comps: Record<string, CompAugments> = {};
  for (const [slug, comp] of Object.entries(data.comps)) {
    const picked = new Set<string>();
    const augments = comp.augments.flatMap((apiName, index) => {
      const path = ["comps", slug, "augments", index];
      const augment = byApiName.get(apiName);
      if (!augment) {
        issues.push(yaml.issue(path, `${apiName} is not in augments, so it has no name or icon to show`));
        return [];
      }
      if (picked.has(apiName)) {
        issues.push(yaml.issue(path, `${apiName} is picked twice for ${slug}`));
        return [];
      }
      picked.add(apiName);
      return [augment];
    });
    comps[slug] = { source: comp.source ?? null, augments };
  }

  if (issues.length) return { issues };
  return {
    issues,
    tiers: {
      patch: data.patch,
      title: data.title ?? "Augment tier list",
      source: data.source ?? null,
      augments: [...byApiName.values()],
      comps,
    },
  };
}
