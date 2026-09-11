import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { Placeholder } from "@/components/placeholder";

export const metadata: Metadata = { title: "Item tiers" };

export default function ItemTiersPage() {
  return (
    <>
      <PageHeader title="Item tier list" description="Curated S–C ratings for the current patch." />
      <Placeholder phase={2} title="Tier rows by kind">
        Completed items, artifacts, emblems and more, grouped by kind and ranked S to C.
      </Placeholder>
    </>
  );
}
