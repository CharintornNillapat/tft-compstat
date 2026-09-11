import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { ItemTierBoard } from "@/components/item-tier-board";
import { PageHeader } from "@/components/page-header";
import { TierListMetaLine } from "@/components/tier-list-meta";
import { getItemTierList } from "@/lib/curated/queries";

export const metadata: Metadata = { title: "Item tiers" };

export default async function ItemTiersPage() {
  const list = await getItemTierList();

  if (!list) {
    return (
      <>
        <PageHeader title="Item tier list" />
        <EmptyState title="No item tier list yet">Check back after the next patch.</EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader title={list.title} description={<TierListMetaLine list={list} />} />
      {list.summary ? <p className="mb-3 text-muted">{list.summary}</p> : null}
      <ItemTierBoard groups={list.groups} />
    </>
  );
}
