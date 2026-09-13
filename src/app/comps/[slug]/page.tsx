import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CompGuide } from "@/components/comp-guide";
import { PageHeader } from "@/components/page-header";
import { getAugmentTiers } from "@/lib/curated/augments";
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
  // Params first: started before them, the augment read would resolve inside the generic
  // shell and stamp its cacheLife("max") on it, when the shell has no comp to show.
  const resolved = await slug;
  const [comp, augments] = await Promise.all([getComp(resolved), getAugmentTiers()]);
  if (!comp) notFound();
  return <CompGuide comp={comp} augments={augments?.comps[comp.slug] ?? null} />;
}
