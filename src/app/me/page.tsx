import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Placeholder } from "@/components/placeholder";
import { SyncPanel } from "./sync-panel";

export const metadata: Metadata = { title: "My stats" };

/** Skeleton while the uncached sync state streams in (Cache Components, §8). */
function SyncPanelFallback() {
  return (
    <section className="rounded-md border border-line bg-panel p-3">
      <div className="h-4 w-40 animate-pulse rounded bg-zinc-800" />
      <div className="mt-3 space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-3 w-full animate-pulse rounded bg-zinc-800/70" />
        ))}
      </div>
    </section>
  );
}

export default function MePage() {
  return (
    <>
      <PageHeader title="My stats" description="Recent matches, cached from the Riot API." />
      <div className="grid gap-3 md:grid-cols-2">
        {/* Sync state is request-time data, so it streams in rather than prerendering. */}
        <Suspense fallback={<SyncPanelFallback />}>
          <SyncPanel />
        </Suspense>
        <Placeholder phase={5} title="Dashboard">
          Avg placement, top-4 rate, placement trend, favorite comps and match history.
        </Placeholder>
      </div>
    </>
  );
}
