import Link from "next/link";
import { ChampionIcon } from "@/components/champion-icon";
import { CompStatsRow } from "@/components/comp-stats";
import { TierBadge } from "@/components/tier-row";
import { getComps } from "@/lib/curated/queries";
import { OverviewPanel } from "./overview-panel";

const SHOWN = 3;
const CARRIES_SHOWN = 3;

/**
 * The curated half of the overview. Reuses the cached `getComps()` that `/comps`
 * already reads, so this is a cache hit under the same `comps` tag rather than a
 * new query — which is also why it sits outside the page's Suspense boundary and
 * prerenders into the static shell.
 */
export async function TopComps() {
  const { comps } = await getComps();
  // `getComps()` is ordered by tier, so the head of the list is S-tier first and
  // falls back to A-tier when fewer than three S comps are published.
  const top = comps.slice(0, SHOWN);

  return (
    <OverviewPanel
      title="Top comps"
      aside={
        comps.length > SHOWN ? (
          <Link href="/comps" className="hover:text-fg">
            All {comps.length} →
          </Link>
        ) : null
      }
    >
      {top.length === 0 ? (
        <p className="text-muted">No comps published yet.</p>
      ) : (
        <ul className="-mx-1 space-y-0.5">
          {top.map((comp) => (
            <li key={comp.slug}>
              <Link
                href={`/comps/${comp.slug}`}
                className="flex items-center gap-2 rounded px-1 py-1 hover:bg-raised"
              >
                <TierBadge tier={comp.tier} className="size-6 shrink-0 text-xs" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{comp.name}</p>
                  <CompStatsRow stats={comp} fields={["avg", "top4"]} />
                </div>
                {/* The name already identifies the comp; the carries are a visual cue. */}
                <span aria-hidden className="flex shrink-0 gap-0.5">
                  {comp.units
                    .filter((unit) => unit.isCarry)
                    .slice(0, CARRIES_SHOWN)
                    .map((unit) => (
                      <ChampionIcon
                        key={unit.apiName}
                        name={unit.name}
                        cost={unit.cost}
                        iconUrl={unit.iconUrl}
                        size={28}
                        alt=""
                      />
                    ))}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </OverviewPanel>
  );
}
