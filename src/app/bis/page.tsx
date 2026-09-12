import type { Metadata } from "next";
import { BisBoard } from "@/components/bis-board";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { getChampionBis } from "@/lib/curated/bis";

export const metadata: Metadata = { title: "Best in slot" };

/**
 * Champion item builds (architecture §8). `getChampionBis()` is a cached read of a
 * generated repo file, so the whole page prerenders static — there is nothing on it
 * that depends on the request.
 */
export default async function BisPage() {
  const bis = await getChampionBis();

  if (!bis) {
    return (
      <>
        <PageHeader title="Best in slot" />
        <EmptyState title="No builds yet">Run `pnpm sync:bis` to generate them.</EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={bis.title}
        description={
          <>
            {bis.champions.length} champions · patch <span className="tabular-nums">{bis.patch}</span>
          </>
        }
      />
      {bis.source ? <p className="mb-3 text-faint">{bis.source}</p> : null}
      <BisBoard champions={bis.champions} />
    </>
  );
}
