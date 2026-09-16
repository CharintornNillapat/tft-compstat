import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { getStaticNames } from "@/lib/static/lookup";
import { getMetaBrief } from "./meta-brief";
import { getCuratedFreshness } from "./queries";

/**
 * The header pill's ambient set, patch and data age (architecture §8).
 *
 * Every field is nullable and **nothing is defaulted to a literal**. A hardcoded
 * "Set 18 · Patch 18.2" would keep printing confidently through a set rollover or a
 * broken sync, under an animated "live" dot — the §6.4 rule, which is why
 * `patchForMatch` returns "18.?" rather than a guess. No `try`/`catch` either: a read
 * that genuinely fails should fail the build, the way a malformed `meta-notes.yaml`
 * already does.
 *
 * Tagged `tiers` as well as `static`, since the age comes from the tier-list seed.
 */
export type HeaderMetaData = {
  /** "Set 18"; null when no set is marked active. */
  setName: string | null;
  /** "18.2"; null when neither the brief nor the tier list names one. */
  patch: string | null;
  /** ISO timestamp of the last curated seed; null when nothing has been seeded. */
  dataUpdatedAt: string | null;
};

export async function getHeaderMeta(): Promise<HeaderMetaData> {
  "use cache";
  cacheTag("static", "tiers");
  cacheLife("days");

  const [{ activeSet }, brief, freshness] = await Promise.all([
    getStaticNames(),
    getMetaBrief(),
    getCuratedFreshness(),
  ]);

  return {
    setName: activeSet ? `Set ${activeSet.id}` : null,
    // The brief is written about this patch, so it wins; the seeded tier list is the
    // fallback. Same order as `PatchLine` on `/`.
    patch: brief?.patch ?? freshness.patch,
    dataUpdatedAt: freshness.updatedAt,
  };
}
