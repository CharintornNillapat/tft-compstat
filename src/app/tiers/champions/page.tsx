import type { Metadata } from "next";
import { ChampionTierBoard } from "@/components/champion-tier-board";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { TierListMetaLine } from "@/components/tier-list-meta";
import { getChampionTierList } from "@/lib/curated/queries";

export const metadata: Metadata = { title: "Champion tiers" };

export default async function ChampionTiersPage() {
  const list = await getChampionTierList();

  if (!list) {
    return (
      <>
        <PageHeader title="Champion tier list" />
        <EmptyState title="No champion tier list yet">Check back after the next patch.</EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader title={list.title} description={<TierListMetaLine list={list} />} />
      {list.summary ? <p className="mb-3 text-muted">{list.summary}</p> : null}
      <ChampionTierBoard tiers={list.tiers} />
    </>
  );
}
