import "server-only";
import { cacheLife } from "next/cache";
import { parseAugmentTiers, type AugmentTiers } from "./augment-tiers";
import { readNewestCuratedFile } from "./curated-files";
import { AUGMENT_TIERS_FILE } from "./schemas";
import { formatIssue } from "./validate";

/**
 * The augment tier list for `/augments` and the comp pages (architecture §7.5, §8).
 *
 * `cacheLife("max")` and **no tag**, like the patch brief and unlike the BIS file:
 * the generated file carries its own names, icons and rarity, so nothing in it comes
 * from the DB, and only a new deployment can change it — which a new build id already
 * invalidates. There is nothing for `/api/revalidate` to revalidate.
 *
 * A missing file returns null (the page shows its empty state and comps show no
 * panel). A malformed one **throws** and fails the build, the way `seed:curated` aborts.
 */
export async function getAugmentTiers(): Promise<AugmentTiers | null> {
  "use cache";
  cacheLife("max");

  const found = await readNewestCuratedFile(AUGMENT_TIERS_FILE);
  if (!found) return null;

  const { file, text } = found;
  const { tiers, issues } = parseAugmentTiers(file, text);
  if (!tiers) {
    throw new Error(`Invalid ${file}:\n${issues.map((issue) => `  ${formatIssue(issue)}`).join("\n")}`);
  }
  return tiers;
}
