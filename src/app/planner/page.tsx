import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { PlannerApp } from "@/components/planner/planner-app";
import { getPlannerData } from "@/lib/planner/planner-data";

export const metadata: Metadata = { title: "Team planner" };

/**
 * The team planner (architecture §8, §9). `getPlannerData()` is a cached read of the
 * static tables, so the page prerenders static; building, saving and loading all
 * happen in the browser, and saved comps never reach the server.
 */
export default async function PlannerPage() {
  const data = await getPlannerData();

  if (!data) {
    return (
      <>
        <PageHeader title="Team planner" />
        <EmptyState title="No active set">Run `pnpm sync:static` to load the game data.</EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Team planner"
        description={
          <>
            Theorycraft boards for {data.set.name}, then copy the code into the in-game Team Planner. Saved comps stay in
            this browser.
          </>
        }
      />
      <PlannerApp data={data} />
    </>
  );
}
