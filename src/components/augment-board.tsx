"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { Augment } from "@/lib/curated/augment-tiers";
import { AUGMENT_RARITIES, TIER_RANKS, type AugmentRarity, type TierRank } from "@/lib/static/game";
import { AugmentDetails, AugmentFace } from "./augment-parts";
import { EmptyState } from "./empty-state";
import { HoverTip, useHoverTip } from "./hover-tip";
import { TierBadge } from "./tier-row";
import { ToggleGroup } from "./toggle-group";

const TIER_OPTIONS = TIER_RANKS.map((tier) => ({ value: tier, label: tier }));
const RARITY_OPTIONS = AUGMENT_RARITIES.map((rarity) => ({ value: rarity, label: rarity }));

/**
 * Augments by tier, filterable by tier and rarity (architecture §9).
 *
 * A tier row of cards rather than `/tiers/items`' icon strip: an augment's icon alone
 * does not say which augment it is the way an item's does, so each card carries its
 * name and rarity. The grid fills by width, so it is three columns at 960px and one at
 * 400px without a breakpoint. Client-side only for the two filters and the shared tooltip.
 */
export function AugmentBoard({ augments }: { augments: Augment[] }) {
  const [tiers, setTiers] = useState<ReadonlySet<TierRank>>(() => new Set());
  const [rarities, setRarities] = useState<ReadonlySet<AugmentRarity>>(() => new Set());
  const tip = useHoverTip<Augment>();

  const groups = useMemo(() => {
    const visible = augments.filter(
      (augment) => (tiers.size === 0 || tiers.has(augment.tier)) && (rarities.size === 0 || rarities.has(augment.rarity)),
    );
    return TIER_RANKS.map((tier) => ({ tier, entries: visible.filter((augment) => augment.tier === tier) })).filter(
      (group) => group.entries.length > 0,
    );
  }, [augments, tiers, rarities]);
  const shown = groups.reduce((sum, group) => sum + group.entries.length, 0);

  return (
    <section aria-label="Augment tier list">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Labelled label="Tier">
          <ToggleGroup label="Tier" options={TIER_OPTIONS} selected={tiers} onChange={setTiers} />
        </Labelled>
        <Labelled label="Rarity">
          <ToggleGroup label="Rarity" options={RARITY_OPTIONS} selected={rarities} onChange={setRarities} />
        </Labelled>
        <p className="text-muted" aria-live="polite">
          {shown} {shown === 1 ? "augment" : "augments"}
        </p>
      </div>

      {groups.length === 0 ? (
        <EmptyState title="No augment matches those filters">Clear a filter to see more augments.</EmptyState>
      ) : (
        <div className="space-y-3">
          {groups.map(({ tier, entries }) => (
            <section key={tier} aria-label={`${tier} tier`} className="flex gap-2.5">
              <TierBadge tier={tier} className="w-8 shrink-0 self-stretch text-sm" />
              <ul className="grid min-w-0 flex-1 grid-cols-[repeat(auto-fill,minmax(12.5rem,1fr))] gap-1.5">
                {entries.map((augment) => (
                  <li key={augment.apiName} className="min-w-0">
                    <button
                      type="button"
                      {...tip.triggerProps(augment)}
                      className="flex w-full min-w-0 items-center gap-2 rounded-md border border-line bg-panel p-1.5 text-left transition-colors hover:bg-raised"
                    >
                      <AugmentFace augment={augment} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {tip.active ? (
        <HoverTip id={tip.id} anchor={tip.active.anchor} wide>
          <AugmentDetails augment={tip.active.item} />
        </HoverTip>
      ) : null}
    </section>
  );
}

/** `ToggleGroup` has only an accessible label; two rows of "All" buttons need visible ones. */
function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span aria-hidden className="text-[11px] tracking-wider text-faint uppercase">
        {label}
      </span>
      {children}
    </div>
  );
}
