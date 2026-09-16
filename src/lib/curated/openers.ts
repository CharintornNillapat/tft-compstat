import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { TierRank } from "@/lib/static/game";
import { getStaticNames } from "@/lib/static/lookup";
import { readNewestCuratedFile } from "./curated-files";
import { getComps } from "./queries";
import { OPENERS_FILE } from "./schemas";
import { formatIssue } from "./validate";
import { validateOpeners, type OpenerCarry, type Openers } from "./opener-validation";

export * from "./opener-validation";
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
 * in `opener-validation.ts`): it's logged and the pivot is left off the card, since
 * `sync:meta` can prune a generated comp an opener names on a routine, unattended run.
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
