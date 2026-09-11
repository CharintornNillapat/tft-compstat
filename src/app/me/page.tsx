import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { Placeholder } from "@/components/placeholder";

export const metadata: Metadata = { title: "My stats" };

export default function MePage() {
  return (
    <>
      <PageHeader title="My stats" description="Recent matches, cached from the Riot API." />
      <div className="grid gap-3 md:grid-cols-2">
        <Placeholder phase={4} title="Match sync">
          Cache-first sync of recent matches, guarded by a DB lock and a 2-minute cooldown.
        </Placeholder>
        <Placeholder phase={5} title="Dashboard">
          Avg placement, top-4 rate, placement trend, favorite comps and match history.
        </Placeholder>
      </div>
    </>
  );
}
