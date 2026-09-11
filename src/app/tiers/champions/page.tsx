import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { Placeholder } from "@/components/placeholder";

export const metadata: Metadata = { title: "Champion tiers" };

export default function ChampionTiersPage() {
  return (
    <>
      <PageHeader title="Champion tier list" description="Curated S–C ratings for the current patch." />
      <Placeholder phase={2} title="Tier rows">
        One row per tier, S to C, with champion icons bordered by cost, a 1–5 cost filter and
        notes on hover.
      </Placeholder>
    </>
  );
}
