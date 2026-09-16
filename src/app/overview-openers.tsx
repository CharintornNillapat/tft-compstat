import Link from "next/link";
import type { ReactNode } from "react";
import { ChampionIcon } from "@/components/champion-icon";
import { ItemIcon } from "@/components/item-icon";
import { TIER_TEXT, TierBadge } from "@/components/tier-row";
import { getOpeners, type Opener } from "@/lib/curated/openers";
import { COST_BG } from "@/components/cost-styles";
import { OPENER_COSTS, OPENER_TIERS } from "@/lib/curated/schemas";
import { OverviewPanel } from "./overview-panel";

/**
 * Stage-2 navigation: which boards to open on, what to slam on them, and where each
 * one goes (architecture §8). Cached from the repo's `openers.yaml`, so like
 * `MetaBrief` and `TopComps` it prerenders into the static shell and sits outside
 * the page's Suspense boundary — no client JS at all, which is the point: this is
 * read on a second monitor between rounds, not interacted with.
 *
 * One grid, strongest tier first. From `md` every card shows. Under `md` only the
 * top tier does — eight cards are most of a phone's page — and a native `<details>`
 * after the grid reveals the rest through `group-has-[details[open]]`, still with no JS.
 * The details is only the toggle; the cards stay in the one grid, because splitting
 * them into per-tier grids left empty slots in every odd-sized tier.
 */
export async function OverviewOpeners() {
  const data = await getOpeners();
  if (!data) return null;

  // `sort` is stable, so the file's order survives inside a tier.
  const openers = [...data.openers].sort((a, b) => OPENER_TIERS.indexOf(a.tier) - OPENER_TIERS.indexOf(b.tier));
  const topTier = openers[0]?.tier;
  const foldedTiers = OPENER_TIERS.filter((tier) => tier !== topTier && openers.some((o) => o.tier === tier));
  const foldedCount = openers.filter((opener) => opener.tier !== topTier).length;

  return (
    <OverviewPanel
      title="Openers"
      subtitle={data.title}
      aside={<CostKey />}
      className="group/openers md:col-span-2"
    >
      <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {openers.map((opener) => (
          <OpenerCard key={opener.name} opener={opener} folded={opener.tier !== topTier} />
        ))}
      </ul>

      {foldedCount > 0 && (
        <details className="group mt-2 md:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-center gap-1.5 rounded border border-line py-1.5 text-muted hover:bg-raised hover:text-fg [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">
              Show {foldedCount} more ({foldedTiers.join(", ")} tier)
            </span>
            <span className="hidden group-open:inline">Show fewer</span>
            <span aria-hidden className="text-[9px] transition-transform group-open:rotate-180">
              ▼
            </span>
          </summary>
        </details>
      )}
    </OverviewPanel>
  );
}

/** What the portrait borders mean. Two costs, so it costs one line and earns it. */
function CostKey() {
  return (
    <span className="flex items-center gap-1.5">
      {OPENER_COSTS.map((cost) => (
        <span key={cost} className="flex items-center gap-1">
          <span aria-hidden className={`size-2 rounded-full ${COST_BG[cost] ?? "bg-line"}`} />
          <span className="text-[11px] tabular-nums">{cost}-cost</span>
        </span>
      ))}
    </span>
  );
}

/**
 * Five rows (name, board, slam, into, notes) on a **subgrid** of the list's grid, so
 * each row lines up with the same row on the cards beside it — a slam list that
 * wraps to two lines pushes the neighbours' "Into" down with it instead of leaving
 * the cards ragged.
 *
 * `folded` cards are hidden under `md` until the panel's `<details>` is open.
 */
function OpenerCard({ opener, folded }: { opener: Opener; folded: boolean }) {
  return (
    <li
      className={`row-span-5 grid min-w-0 grid-rows-subgrid gap-y-0 rounded border border-line bg-raised/40 p-2 ${
        folded ? "max-md:hidden max-md:group-has-[details[open]]/openers:grid" : ""
      }`}
    >
      <div className="mb-1 flex min-w-0 items-center gap-1.5">
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
            {/* Neutral pill with only the tier letter coloured: tier-coloured names in
                rose read as the red "Nerfed" badges one panel up. */}
            <Link
              href={`/comps/${pivot.slug}`}
              className="flex max-w-full items-center gap-1.5 rounded-full border border-line py-0.5 pr-2 pl-1 text-[11px] text-muted hover:border-faint hover:bg-raised hover:text-fg"
            >
              {pivot.carry ? (
                <span className="-my-0.5 shrink-0">
                  <ChampionIcon
                    name={pivot.carry.name}
                    cost={pivot.carry.cost}
                    iconUrl={pivot.carry.iconUrl}
                    size={16}
                    alt=""
                  />
                </span>
              ) : null}
              <span className={`font-bold ${TIER_TEXT[pivot.tier]}`}>{pivot.tier}</span>
              <span className="min-w-0 truncate">{pivot.name}</span>
            </Link>
          </li>
        ))}
      </Row>

      <p className="pt-1.5 text-[12px] text-faint">{opener.notes}</p>
    </li>
  );
}

/**
 * A labelled row of `<li>`s inside a card. The label column is a fixed width — wide
 * enough for "BOARD", the longest of the three — so
 * "Board", "Slam" and "Into" line up down the card and the eye can jump straight
 * to the one it wants. `aria-label` rather than a real heading: three headings per
 * card times eight cards would bury the page's actual outline.
 *
 * `content-start`: the subgrid can make this row taller than its chips, and the
 * default `align-content` would spread them down it, away from their label.
 */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-1.5 py-0.5">
      <span aria-hidden className="w-9 shrink-0 pt-1 text-[9px] tracking-wider text-faint uppercase">
        {label}
      </span>
      <ul aria-label={label} className="flex min-w-0 flex-1 flex-wrap content-start items-center gap-1">
        {children}
      </ul>
    </div>
  );
}
