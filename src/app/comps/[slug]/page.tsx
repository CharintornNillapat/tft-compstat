import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Placeholder } from "@/components/placeholder";

export default function CompPage({ params }: PageProps<"/comps/[slug]">) {
  return (
    <>
      {/* Params are request-time data under Cache Components: resolve inside Suspense. */}
      <Suspense fallback={<PageHeader title="Comp guide" />}>
        {params.then(({ slug }) => (
          <PageHeader title={slug} description="Comp guide" />
        ))}
      </Suspense>
      <Placeholder phase={3} title="Board & guide">
        Hex board positioning, carry item builds, early and flex units, and the written guide.
      </Placeholder>
    </>
  );
}
