import type { Metadata } from "next";
import { CompList } from "@/components/comp-list";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { getComps } from "@/lib/curated/queries";

export const metadata: Metadata = { title: "Comps" };

const updated = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

export default async function CompsPage() {
  const { setName, comps } = await getComps();

  if (comps.length === 0) {
    return (
      <>
        <PageHeader title="Meta comps" />
        <EmptyState title="No comps yet">Check back after the next patch.</EmptyState>
      </>
    );
  }

  const lastUpdate = comps.reduce((latest, comp) => (comp.updatedAt > latest ? comp.updatedAt : latest), "");
  return (
    <>
      <PageHeader
        title="Meta comps"
        description={
          <>
            Curated comps{setName ? ` for ${setName}` : ""} · Updated{" "}
            <time dateTime={lastUpdate}>{updated.format(new Date(lastUpdate))}</time>
          </>
        }
      />
      <CompList comps={comps} />
    </>
  );
}
