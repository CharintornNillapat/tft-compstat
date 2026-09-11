import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { Placeholder } from "@/components/placeholder";

export const metadata: Metadata = { title: "Comps" };

export default function CompsPage() {
  return (
    <>
      <PageHeader title="Meta comps" description="Curated comps for the current patch." />
      <Placeholder phase={3} title="Comp list">
        Dense rows: tier, name, style, carries with items and active traits. Filter by tier and
        style, plus search.
      </Placeholder>
    </>
  );
}
