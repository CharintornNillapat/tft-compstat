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
      <PalettePreview />
    </>
  );
}

// Temporary: shows the design tokens for Phase 1 review. Remove in Phase 5.
function PalettePreview() {
  const costs = [
    ["1", "border-cost-1 text-cost-1"],
    ["2", "border-cost-2 text-cost-2"],
    ["3", "border-cost-3 text-cost-3"],
    ["4", "border-cost-4 text-cost-4"],
    ["5", "border-cost-5 text-cost-5"],
  ] as const;
  const tiers = [
    ["S", "bg-tier-s"],
    ["A", "bg-tier-a"],
    ["B", "bg-tier-b"],
    ["C", "bg-tier-c"],
  ] as const;
  const placements = [1, 2, 3, 4, 5, 6, 7, 8].map(
    (p) =>
      [
        p,
        p === 1
          ? "bg-place-win/15 text-place-win"
          : p <= 4
            ? "bg-place-top4/15 text-place-top4"
            : "bg-place-bot4/15 text-muted",
      ] as const,
  );
  const traits = [
    ["Bronze", "border-trait-bronze text-trait-bronze"],
    ["Silver", "border-trait-silver text-trait-silver"],
    ["Gold", "border-trait-gold text-trait-gold"],
    ["Prismatic", "border-trait-prismatic text-trait-prismatic"],
  ] as const;

  return (
    <section className="mt-6 rounded-md border border-line bg-panel p-3">
      <h2 className="mb-2 text-[11px] font-medium tracking-wider text-faint uppercase">Palette</h2>
      <dl className="grid grid-cols-[5.5rem_1fr] items-center gap-x-3 gap-y-2">
        <dt className="text-faint">Cost</dt>
        <dd className="flex flex-wrap gap-1.5">
          {costs.map(([label, cls]) => (
            <span key={label} className={`grid size-7 place-items-center rounded border-2 bg-raised font-semibold ${cls}`}>
              {label}
            </span>
          ))}
        </dd>
        <dt className="text-faint">Tier</dt>
        <dd className="flex flex-wrap gap-1.5">
          {tiers.map(([label, cls]) => (
            <span key={label} className={`grid h-6 w-7 place-items-center rounded font-bold text-surface ${cls}`}>
              {label}
            </span>
          ))}
        </dd>
        <dt className="text-faint">Placement</dt>
        <dd className="flex flex-wrap gap-1">
          {placements.map(([p, cls]) => (
            <span key={p} className={`grid h-6 w-6 place-items-center rounded font-semibold ${cls}`}>
              {p}
            </span>
          ))}
        </dd>
        <dt className="text-faint">Trait</dt>
        <dd className="flex flex-wrap gap-1.5">
          {traits.map(([label, cls]) => (
            <span key={label} className={`rounded border px-1.5 py-px ${cls}`}>
              {label}
            </span>
          ))}
        </dd>
      </dl>
    </section>
  );
}
