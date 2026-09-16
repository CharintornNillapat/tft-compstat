import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { TierRank } from "@/lib/static/game";
import { getStaticNames } from "@/lib/static/lookup";
import type { NameBook } from "@/lib/static/names";
import { readNewestCuratedFile } from "./curated-files";
import { getComps } from "./queries";
import { OPENER_COSTS, OPENERS_FILE, openersFileSchema, type OpenerTier } from "./schemas";
import { formatIssue, parseYaml, suggestApiNames, type SeedIssue } from "./validate";

/**
 * The stage-2 opener boards on `/` (architecture §7, §8). Like the patch brief,
 * this file is read from the repo during prerender rather than seeded — but it
 * names champions, items and comps, so every reference is resolved here instead,
 * against the same static tables `seed-curated` checks against and the same
 * published comps `/comps` lists.
 */

export type OpenerUnit = { apiName: string; name: string; cost: number; iconUrl: string | null };
export type OpenerItem = { apiName: string; name: string; iconUrl: string | null };
export type OpenerCarry = { name: string; cost: number; iconUrl: string | null };
/** A comp this opener pivots into. `name` is the comp's, so the pill isn't a slug. */
export type OpenerPivot = { slug: string; name: string; tier: TierRank; carry?: OpenerCarry };

export type Opener = {
  name: string;
  tier: OpenerTier;
  units: OpenerUnit[];
  items: OpenerItem[];
  pivots: OpenerPivot[];
  notes: string;
};

export type Openers = { patch: string; title: string; openers: Opener[] };

/** What the file's api names and slugs are checked against. */
export type OpenerReferences = {
  names: NameBook;
  comps: ReadonlyMap<string, { name: string; tier: TierRank; carry?: OpenerCarry }>;
};

const costList = OPENER_COSTS.map((cost) => `${cost}-cost`).join(" and ");

/**
 * Pure: YAML text plus the reference tables → openers, or the issues that stopped
 * them, each with `file:line:col`. Beyond the schema: every unit exists and is
 * cheap enough to open on, every item exists, and nothing is listed twice.
 *
 * A pivot naming a comp that isn't published is **not** one of those fatal
 * issues: it's reported as a `warning` instead, and the pivot is dropped from
 * the card rather than failing the whole build. `sync:meta` prunes generated
 * comps daily (architecture §7.2), so a comp an opener still names can vanish
 * from a routine, unattended run — the card should just show one fewer pill,
 * not take the build down with it. A typo'd champion or item stays fatal: those
 * can only be introduced by a hand edit, which is exactly when a loud failure
 * is wanted.
 */
export function validateOpeners(input: {
  /** Repo-relative path, used in issues. */
  file: string;
  text: string;
  refs: OpenerReferences;
}): { openers?: Openers; issues: SeedIssue[]; warnings: SeedIssue[] } {
  const { file, refs } = input;
  const yaml = parseYaml(file, input.text);
  if (yaml.syntaxIssues.length) return { issues: yaml.syntaxIssues, warnings: [] };

  const parsed = openersFileSchema.safeParse(yaml.data);
  if (!parsed.success) {
    return {
      issues: parsed.error.issues.map((issue) => yaml.issue(issue.path, issue.message)),
      warnings: [],
    };
  }
  const data = parsed.data;
  const issues: SeedIssue[] = [];
  const warnings: SeedIssue[] = [];

  const didYouMean = (input: string, candidates: Iterable<readonly [string, { name: string }]>) => {
    const suggestions = suggestApiNames(input, candidates);
    return suggestions.length ? `. Did you mean ${suggestions.join(" or ")}?` : "";
  };

  /** Flags the second and later mentions of a value inside one list. */
  const duplicates = (values: readonly string[], path: (index: number) => PropertyKey[], what: string) => {
    const seen = new Set<string>();
    return values.map((value, i) => {
      const isDuplicate = seen.has(value);
      if (isDuplicate) issues.push(yaml.issue(path(i), `${value} is already listed as ${what}`));
      seen.add(value);
      return isDuplicate;
    });
  };

  const namedAt = new Map<string, number>();
  const openers = data.openers.map((opener, index): Opener => {
    const at = (...rest: PropertyKey[]) => ["openers", index, ...rest];

    const first = namedAt.get(opener.name);
    if (first !== undefined) {
      issues.push(yaml.issue(at("name"), `"${opener.name}" is already the name of openers[${first}]`));
    } else {
      namedAt.set(opener.name, index);
    }

    const repeatedUnits = duplicates(opener.core_units, (i) => at("core_units", i), "a core unit");
    const units = opener.core_units.map((apiName, i): OpenerUnit => {
      const champion = refs.names.champions[apiName];
      if (!champion) {
        const candidates = Object.entries(refs.names.champions);
        issues.push(yaml.issue(at("core_units", i), `unknown champion "${apiName}"${didYouMean(apiName, candidates)}`));
      } else if (!repeatedUnits[i] && !OPENER_COSTS.includes(champion.cost)) {
        issues.push(
          yaml.issue(
            at("core_units", i),
            `${champion.name} is a ${champion.cost}-cost; an opener fields ${costList} units`,
          ),
        );
      }
      return { apiName, name: champion?.name ?? apiName, cost: champion?.cost ?? 0, iconUrl: champion?.iconUrl ?? null };
    });

    duplicates(opener.slammable_items, (i) => at("slammable_items", i), "a slam");
    const items = opener.slammable_items.map((apiName, i): OpenerItem => {
      const item = refs.names.items[apiName];
      if (!item) {
        issues.push(
          yaml.issue(at("slammable_items", i), `unknown item "${apiName}"${didYouMean(apiName, Object.entries(refs.names.items))}`),
        );
      }
      return { apiName, name: item?.name ?? apiName, iconUrl: item?.iconUrl ?? null };
    });

    duplicates(opener.transition_to, (i) => at("transition_to", i), "a pivot");
    const pivots = opener.transition_to.flatMap((slug, i): OpenerPivot[] => {
      const comp = refs.comps.get(slug);
      if (!comp) {
        // Unpublished reads the same as missing here, and it should: either way the
        // pill would otherwise link to a 404. Not fatal — a generated comp this
        // opener names can be pruned by an unattended `sync:meta` run — so the
        // pivot is just left off the card rather than failing the build.
        warnings.push(yaml.issue(at("transition_to", i), `no published comp has the slug "${slug}"; hiding that pivot`));
        return [];
      }
      const pivot: OpenerPivot = { slug, name: comp.name, tier: comp.tier };
      if (comp.carry) pivot.carry = comp.carry;
      return [pivot];
    });

    return { name: opener.name, tier: opener.tier, units, items, pivots, notes: opener.notes };
  });

  if (issues.length) return { issues, warnings };
  return {
    issues,
    warnings,
    openers: { patch: data.patch, title: data.title ?? "Early openers & item slams", openers },
  };
}

/**
 * Re-exported so existing imports of `extractOpenerPivotSlugs` from this module
 * keep working; the implementation lives in `opener-pivots.ts` because it also
 * needs to be importable from `sync-meta.ts`, a plain script that can't pull in
 * this module's `next/cache` and Supabase-client dependencies.
 */
export { extractOpenerPivotSlugs } from "./opener-pivots";

/**
 * Tagged `static` and `comps` rather than `cacheLife("max")` like the patch brief:
 * the YAML ships in the deployment, but the names, icons and comp titles it renders
 * come from the DB, so a `sync:static` or `seed:curated` has to be able to refresh
 * it. `getComps()` is the same cached read `/comps` and `TopComps` already make.
 *
 * A missing file returns null and the section doesn't render. A file that names
 * an unknown unit or item **throws**, failing the build the way `seed:curated`
 * aborts on a typo — those can only come from a hand edit, so a loud failure is
 * wanted. A pivot naming an unpublished comp is not fatal (see `validateOpeners`
 * above): it's logged and the pivot is left off the card, since `sync:meta` can
 * prune a generated comp an opener names on a routine, unattended run.
 */
export async function getOpeners(): Promise<Openers | null> {
  "use cache";
  cacheTag("static", "comps");
  cacheLife("days");

  const found = await readNewestCuratedFile(OPENERS_FILE);
  if (!found) return null;

  const [{ names }, { comps }] = await Promise.all([getStaticNames(), getComps()]);
  const { file, text } = found;
  const compRefs = new Map<string, { name: string; tier: TierRank; carry?: OpenerCarry }>();
  for (const comp of comps) {
    const mainCarry = comp.units.find((u) => u.isCarry) ?? comp.units[0];
    const carry = mainCarry
      ? { name: mainCarry.name, cost: mainCarry.cost, iconUrl: mainCarry.iconUrl }
      : undefined;
    compRefs.set(comp.slug, { name: comp.name, tier: comp.tier, carry });
  }

  const { openers, issues, warnings } = validateOpeners({
    file,
    text,
    refs: { names, comps: compRefs },
  });
  if (!openers) {
    throw new Error(`Invalid ${file}:\n${issues.map((issue) => `  ${formatIssue(issue)}`).join("\n")}`);
  }
  for (const warning of warnings) console.warn(`[openers] ${formatIssue(warning)}`);
  return openers;
}
