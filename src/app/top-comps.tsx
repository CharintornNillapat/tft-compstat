import Link from "next/link";
import { TierBadge } from "@/components/tier-row";
import { getComps } from "@/lib/curated/queries";

const SHOWN = 3;

/**
 * The curated half of the overview. Reuses the cached `getComps()` that `/comps`
 * already reads, so this is a cache hit under the same `comps` tag rather than a
 * new query — which is also why it sits outside the page's Suspense boundary and
 * prerenders into the static shell.
 */
export async function TopComps() {
  const { comps } = await getComps();
  const top = comps.filter((comp) => comp.tier === "S").slice(0, SHOWN);

  return (
    <section className="rounded-md border border-line bg-panel p-3">
      <h2 className="mb-1.5 text-[11px] tracking-wider text-faint uppercase">Top comps</h2>
      {top.length === 0 ? (
        <p className="text-muted">No S-tier comps published yet.</p>
      ) : (
        <ul className="space-y-1">
          {top.map((comp) => (
            <li key={comp.slug}>
              <Link
                href={`/comps/${comp.slug}`}
                className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-raised"
              >
                <TierBadge tier={comp.tier} />
                <span className="min-w-0 flex-1 truncate">{comp.name}</span>
                <span className="shrink-0 text-faint tabular-nums">{comp.patch}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
