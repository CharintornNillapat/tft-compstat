import Link from "next/link";
import type { ReactNode } from "react";
import { ChampionIcon } from "@/components/champion-icon";
import { ItemIcon } from "@/components/item-icon";
import { TIER_TEXT, TierBadge } from "@/components/tier-row";
import { getOpeners, type Opener } from "@/lib/curated/openers";
import { COST_BG } from "@/components/cost-styles";
import { OPENER_COSTS } from "@/lib/curated/schemas";

/**
 * Stage-2 navigation: which boards to open on, what to slam on them, and where each
 * one goes (architecture §8). Cached from the repo's `openers.yaml`, so like
 * `MetaBrief` and `TopComps` it prerenders into the static shell and sits outside
 * the page's Suspense boundary — no client JS at all, which is the point: this is
 * read on a second monitor between rounds, not interacted with.
 *
 * Spans the full grid row and then makes its own columns: eight cards next to the
 * three glance panels would be a column of slivers.
 */
export async function OverviewOpeners() {
  const data = await getOpeners();
  if (!data) return null;

  return (
    <section className="rounded-md border border-line bg-panel p-3 md:col-span-3">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h2 className="text-[11px] tracking-wider text-faint uppercase">Openers</h2>
        <span className="min-w-0 truncate text-muted">{data.title}</span>
        <span className="ml-auto flex shrink-0 items-center gap-2">
          <CostKey />
          <span className="text-faint tabular-nums">Patch {data.patch}</span>
        </span>
      </div>

      <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {data.openers.map((opener) => (
          <OpenerCard key={opener.name} opener={opener} />
        ))}
      </ul>
    </section>
  );
}

/** What the portrait borders mean. Two costs, so it costs one line and earns it. */
function CostKey() {
  return (
    <span className="flex items-center gap-1.5 text-faint">
      {OPENER_COSTS.map((cost) => (
        <span key={cost} className="flex items-center gap-1">
          <span aria-hidden className={`size-2 rounded-full ${COST_BG[cost] ?? "bg-line"}`} />
          <span className="text-[11px] tabular-nums">{cost}-cost</span>
        </span>
      ))}
    </span>
  );
}

function OpenerCard({ opener }: { opener: Opener }) {
  return (
    <li className="flex min-w-0 flex-col rounded border border-line bg-raised/40 p-2">
      <div className="mb-1.5 flex items-center gap-1.5">
        <TierBadge tier={opener.tier} className="size-4 shrink-0 text-[10px]" />
        <h3 className="min-w-0 flex-1 truncate font-semibold">{opener.name}</h3>
      </div>

      <Row label="Board">
        {opener.units.map((unit) => (
          <li key={unit.apiName} className="flex">
            <ChampionIcon name={unit.name} cost={unit.cost} iconUrl={unit.iconUrl} size={30} />
          </li>
        ))}
      </Row>

      <Row label="Slam">
        {opener.items.map((item, index) => (
          <li
            key={item.apiName}
            className="flex min-w-0 max-w-full items-center gap-1 rounded border border-line bg-surface/60 py-0.5 pr-1.5 pl-0.5"
          >
            {/* The name is right there, so the icon would only repeat it to a screen reader. */}
            <ItemIcon name={item.name} iconUrl={item.iconUrl} size={18} alt="" />
            <span className="min-w-0 truncate text-[11px] text-muted">
              <span className="text-faint tabular-nums">{index + 1}. </span>
              {item.name}
            </span>
          </li>
        ))}
      </Row>

      <Row label="Into">
        {opener.pivots.map((pivot) => (
          <li key={pivot.slug} className="flex min-w-0">
          <Link
            href={`/comps/${pivot.slug}`}
            className={`max-w-full truncate rounded-full border border-line px-1.5 py-px text-[11px] hover:border-current hover:bg-raised ${TIER_TEXT[pivot.tier]}`}
          >
            {pivot.name}
          </Link>
          </li>
        ))}
      </Row>

      {/* mt-auto so the notes sit on the card's floor and the cards in a row line up. */}
      <p className="mt-auto pt-1.5 text-[12px] text-faint">{opener.notes}</p>
    </li>
  );
}

/**
 * A labelled row of `<li>`s inside a card. The label column is a fixed width — wide
 * enough for "BOARD", the longest of the three — so
 * "Board", "Slam" and "Into" line up down the card and the eye can jump straight
 * to the one it wants. `aria-label` rather than a real `<h4>`: three headings per
 * card times eight cards would bury the page's actual outline.
 */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-1.5 py-0.5">
      <span aria-hidden className="w-9 shrink-0 pt-1 text-[9px] tracking-wider text-faint uppercase">
        {label}
      </span>
      <ul aria-label={label} className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        {children}
      </ul>
    </div>
  );
}
