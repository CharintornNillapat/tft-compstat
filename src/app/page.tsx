import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { SkeletonPanel } from "@/components/skeleton";
import { MetaBrief } from "./meta-brief";
import { OverviewGlance } from "./overview-glance";
import { TopComps } from "./top-comps";

/**
 * Glance panel for a second monitor (architecture §8). `TopComps` and `MetaBrief` are
 * cached reads and prerender into the static shell; the player data is uncached and
 * streams in. `MetaBrief` spans the whole second row, so the three panels above it
 * keep their columns.
 */
export default function OverviewPage() {
  return (
    <>
      <PageHeader title="Overview" description="Glance panel for a second monitor." />
      <div className="grid gap-3 md:grid-cols-3">
        {/* Two boxes in the fallback, matching the two sections the glance renders,
            so the grid doesn't reflow from two columns to three on hydration. */}
        <Suspense
          fallback={
            <>
              <SkeletonPanel lines={2} />
              <SkeletonPanel lines={2} />
            </>
          }
        >
          <OverviewGlance />
        </Suspense>
        <TopComps />
        <MetaBrief />
      </div>
    </>
  );
}
