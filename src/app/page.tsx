import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { SkeletonPanel } from "@/components/skeleton";
import { getMetaBrief } from "@/lib/curated/meta-brief";
import { getComps } from "@/lib/curated/queries";
import { MetaBrief } from "./meta-brief";
import { OverviewGlance } from "./overview-glance";
import { OverviewOpeners } from "./overview-openers";
import { TopComps } from "./top-comps";

/**
 * Glance panel for a second monitor (architecture §8). `TopComps`, `MetaBrief`,
 * `OverviewOpeners` and the header's patch line are cached reads and prerender into
 * the static shell; the player data is uncached and streams in. Two columns: the
 * player card and top comps share the first row, and the last two span the page.
 */
export default function OverviewPage() {
  return (
    <>
      <PageHeader title="Overview" description={<PatchLine />} />
      <div className="grid gap-3 md:grid-cols-2">
        <Suspense fallback={<SkeletonPanel lines={4} />}>
          <OverviewGlance />
        </Suspense>
        <TopComps />
        <MetaBrief />
        <OverviewOpeners />
      </div>
    </>
  );
}

/**
 * The patch, said once for the whole page instead of on every panel. The brief's
 * patch wins because it is the one written about this patch; the comps' is the
 * fallback when there is no brief. Both reads are cache hits the panels make anyway.
 */
async function PatchLine() {
  const [{ setName, comps }, brief] = await Promise.all([getComps(), getMetaBrief()]);
  const patch = brief?.patch ?? comps[0]?.patch;
  return [setName, patch ? `Patch ${patch}` : null].filter(Boolean).join(" · ") || "What to know before you queue.";
}
