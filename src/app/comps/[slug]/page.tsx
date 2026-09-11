import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CompGuide } from "@/components/comp-guide";
import { PageHeader } from "@/components/page-header";
import { getComp, getCompSlugs } from "@/lib/curated/queries";

// Cache Components needs at least one param at build time; other slugs render on first visit.
const NO_COMPS = "__none__";

export async function generateStaticParams() {
  const slugs = await getCompSlugs();
  return (slugs.length ? slugs : [NO_COMPS]).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/comps/[slug]">): Promise<Metadata> {
  const comp = await getComp((await params).slug);
  return { title: comp ? comp.name : "Comp not found" };
}

export default function CompPage({ params }: PageProps<"/comps/[slug]">) {
  return (
    // Params are request-time data under Cache Components: resolve inside Suspense.
    <Suspense fallback={<PageHeader title="Comp guide" />}>
      <CompBody slug={params.then((p) => p.slug)} />
    </Suspense>
  );
}

async function CompBody({ slug }: { slug: Promise<string> }) {
  const comp = await getComp(await slug);
  if (!comp) notFound();
  return <CompGuide comp={comp} />;
}
