import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { SkeletonPanel } from "@/components/skeleton";
import { Dashboard } from "./dashboard";
import { MeHeader } from "./me-header";

export const metadata: Metadata = { title: "My stats" };

/**
 * Two Suspense islands rather than one (architecture §8). The header needs the
 * service-role read of `sync_state` and answers "am I looking at fresh data?", so
 * it paints first instead of queueing behind the 50-row stats query.
 */
export default function MePage() {
  return (
    <>
      <PageHeader title="My stats" description="Recent matches, cached from the Riot API." />
      <div className="space-y-3">
        <Suspense fallback={<SkeletonPanel lines={4} />}>
          <MeHeader />
        </Suspense>
        <Suspense fallback={<SkeletonPanel lines={6} />}>
          <Dashboard />
        </Suspense>
      </div>
    </>
  );
}
