import type { Metadata } from "next";
import { AugmentBoard } from "@/components/augment-board";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { getAugmentTiers } from "@/lib/curated/augments";

export const metadata: Metadata = { title: "Augments" };

/**
 * The augment tier list (architecture §7.5, §8). `getAugmentTiers()` is a cached read
 * of a generated repo file that needs nothing from the DB, so the page prerenders
 * fully static and only a deployment changes it.
 */
export default async function AugmentsPage() {
  const tiers = await getAugmentTiers();

  if (!tiers) {
    return (
      <>
        <PageHeader title="Augment tier list" />
        <EmptyState title="No augment tier list yet">Run `pnpm sync:meta` to generate it.</EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={tiers.title}
        description={
          <>
            {tiers.augments.length} augments · patch <span className="tabular-nums">{tiers.patch}</span>
          </>
        }
      />
      {tiers.source ? <p className="mb-3 text-faint">{tiers.source}</p> : null}
      <AugmentBoard augments={tiers.augments} />
    </>
  );
}
