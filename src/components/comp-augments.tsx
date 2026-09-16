"use client";

import type { Augment } from "@/lib/curated/augment-tiers";
import { AugmentDetails, AugmentFace } from "./augment-parts";
import { HoverTip, useHoverTip } from "./hover-tip";

/**
 * Interactive list of recommended augments for a comp guide (architecture §9).
 * Clicking, focusing, or hovering an augment opens the rich `HoverTip` with full
 * tier, rarity, and description text — solving the limitation of native title tooltips
 * on touch devices and desktop.
 */
export function CompAugmentsList({ augments }: { augments: Augment[] }) {
  const tip = useHoverTip<Augment>();

  return (
    <>
      <ul className="grid grid-cols-1 gap-1.5 min-[420px]:grid-cols-2 sm:grid-cols-3 md:grid-cols-2 xl:grid-cols-3">
        {augments.map((augment) => (
          <li key={augment.apiName} className="min-w-0">
            <button
              type="button"
              {...tip.triggerProps(augment)}
              aria-label={augment.name}
              className="flex w-full min-w-0 items-center gap-2 rounded-md border border-line bg-raised/40 p-1.5 text-left transition-colors hover:bg-raised focus-visible:outline-2 focus-visible:outline-accent"
            >
              <AugmentFace augment={augment} />
            </button>
          </li>
        ))}
      </ul>

      {tip.active ? (
        <HoverTip id={tip.id} anchor={tip.active.anchor} wide>
          <AugmentDetails augment={tip.active.item} />
        </HoverTip>
      ) : null}
    </>
  );
}
