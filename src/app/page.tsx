import { PageHeader } from "@/components/page-header";
import { Placeholder } from "@/components/placeholder";

export default function OverviewPage() {
  return (
    <>
      <PageHeader title="Overview" description="Glance panel for a second monitor." />
      <div className="grid gap-3 md:grid-cols-3">
        <Placeholder phase={5} title="Rank & LP">
          Current rank, LP and recent LP movement from cached snapshots.
        </Placeholder>
        <Placeholder phase={5} title="Last 10 placements">
          Placement pills and a sparkline from cached matches.
        </Placeholder>
        <Placeholder phase={3} title="Top comps">
          S-tier curated comps for the current patch.
        </Placeholder>
      </div>
    </>
  );
}
