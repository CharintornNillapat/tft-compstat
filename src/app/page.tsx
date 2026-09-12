import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { SkeletonPanel } from "@/components/skeleton";
import { OverviewGlance } from "./overview-glance";
import { TopComps } from "./top-comps";

/**
 * Glance panel for a second monitor (architecture §8). `TopComps` is a cached read
 * and prerenders into the static shell; the player data is uncached and streams in.
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
      </div>
    </>
  );
}
