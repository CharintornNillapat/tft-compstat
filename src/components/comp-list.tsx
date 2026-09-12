"use client";

import Link from "next/link";
import { useState } from "react";
import { filterComps } from "@/lib/curated/comp-filter";
import type { CompSummary, CompUnit } from "@/lib/curated/queries";
import type { TraitCount } from "@/lib/curated/traits";
import {
  COMP_STYLE_LABELS,
  COMP_STYLES,
  DIFFICULTY_LABELS,
  TIER_RANKS,
  type CompStyle,
  type TierRank,
} from "@/lib/static/game";
import { ChampionIcon } from "./champion-icon";
import { StarPips, TraitDetails, UnitDetails } from "./comp-details";
import { EmptyState } from "./empty-state";
import { HoverTip, useHoverTip } from "./hover-tip";
import { ItemIcon } from "./item-icon";
import { TierBadge } from "./tier-row";
import { TraitHex } from "./trait-badge";
import { ToggleGroup } from "./toggle-group";

type Tip = ReturnType<typeof useHoverTip<CompUnit | TraitCount>>;

/** Dense comp rows with tier/style filters and search; units and traits show details on hover. */
export function CompList({ comps }: { comps: CompSummary[] }) {
  const [tiers, setTiers] = useState<ReadonlySet<TierRank>>(() => new Set());
  const [styles, setStyles] = useState<ReadonlySet<CompStyle>>(() => new Set());
  const [query, setQuery] = useState("");
  const tip = useHoverTip<CompUnit | TraitCount>();

  const tierOptions = TIER_RANKS.filter((tier) => comps.some((comp) => comp.tier === tier)).map((tier) => ({
    value: tier,
    label: tier,
  }));
  const styleOptions = COMP_STYLES.filter((style) => comps.some((comp) => comp.style === style)).map((style) => ({
    value: style,
    label: COMP_STYLE_LABELS[style],
  }));
  const visible = filterComps(comps, { tiers, styles, query });

  return (
    <section aria-label="Comps">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search comps, units, traits, items  ( / )"
          aria-label="Search comps"
          className="h-7 w-full min-w-0 rounded border border-line bg-panel px-2 placeholder:text-faint sm:w-60"
        />
        <ToggleGroup label="Filter by tier" options={tierOptions} selected={tiers} onChange={setTiers} />
        <ToggleGroup label="Filter by style" options={styleOptions} selected={styles} onChange={setStyles} />
        <p className="text-muted sm:ml-auto" aria-live="polite">
          {visible.length === comps.length ? comps.length : `${visible.length} of ${comps.length}`}{" "}
          {comps.length === 1 ? "comp" : "comps"}
        </p>
      </div>

      {visible.length ? (
        <ol className="divide-y divide-line rounded-md border border-line bg-panel">
          {visible.map((comp) => (
            <CompRow key={comp.slug} comp={comp} tip={tip} />
          ))}
        </ol>
      ) : (
        <EmptyState title="No comps match">Clear a filter or change the search.</EmptyState>
      )}

      {tip.active ? (
        <HoverTip id={tip.id} anchor={tip.active.anchor}>
          {"breakpoints" in tip.active.item ? (
            <TraitDetails trait={tip.active.item} />
          ) : (
            <UnitDetails unit={tip.active.item} />
          )}
        </HoverTip>
      ) : null}
    </section>
  );
}

function CompRow({ comp, tip }: { comp: CompSummary; tip: Tip }) {
  const carries = comp.units.filter((unit) => unit.isCarry);
  const others = comp.units.filter((unit) => !unit.isCarry);
  const difficulty = comp.difficulty ? DIFFICULTY_LABELS[comp.difficulty] : null;

  return (
    <li className="relative flex flex-wrap items-center gap-x-4 gap-y-2 px-2.5 py-2 transition-colors hover:bg-raised/40">
      <div className="flex w-full min-w-0 items-center gap-2.5 sm:w-48 sm:shrink-0">
        <TierBadge tier={comp.tier} className="size-8 shrink-0 text-sm" />
        <div className="min-w-0">
          <h2 className="truncate font-semibold">
            {/* Stretched link: the whole row opens the guide; units and traits sit above it. */}
            <Link href={`/comps/${comp.slug}`} className="after:absolute after:inset-0 hover:text-accent">
              {comp.name}
            </Link>
          </h2>
          <p className="truncate text-xs text-muted">
            {COMP_STYLE_LABELS[comp.style]}
            {difficulty ? ` · ${difficulty}` : ""}
          </p>
        </div>
      </div>

      <ul aria-label="Units, carries first" className="pointer-events-none relative flex flex-wrap items-start gap-0.5">
        {carries.map((unit) => (
          <UnitChip key={unit.apiName} unit={unit} tip={tip} />
        ))}
        {carries.length && others.length ? <li aria-hidden className="mx-1 w-px self-stretch bg-line" /> : null}
        {others.map((unit) => (
          <UnitChip key={unit.apiName} unit={unit} tip={tip} />
        ))}
      </ul>

      <ul aria-label="Active traits" className="pointer-events-none relative flex flex-wrap gap-0.5 lg:ml-auto">
        {comp.traits.map((trait) => (
          <li key={trait.apiName}>
            <button
              type="button"
              {...tip.triggerProps(trait)}
              aria-label={`${trait.count} ${trait.name}`}
              className="pointer-events-auto flex items-center gap-1 rounded px-1 py-0.5 hover:bg-raised"
            >
              <TraitHex trait={trait} />
              <span className="text-xs">{trait.count}</span>
            </button>
          </li>
        ))}
      </ul>
    </li>
  );
}

function UnitChip({ unit, tip }: { unit: CompUnit; tip: Tip }) {
  return (
    <li>
      <button
        type="button"
        {...tip.triggerProps(unit)}
        aria-label={unit.name}
        className="pointer-events-auto flex flex-col items-center gap-0.5 rounded p-0.5 hover:bg-raised"
      >
        <span className="relative">
          <ChampionIcon name={unit.name} cost={unit.cost} iconUrl={unit.iconUrl} size={36} alt="" />
          {unit.star === 3 ? (
            <StarPips star={3} className="absolute inset-x-0 -top-1 text-center text-[9px]" />
          ) : null}
        </span>
        {unit.items.length ? (
          <span className="flex gap-px">
            {unit.items.map((item, i) => (
              <ItemIcon key={i} name={item.name} iconUrl={item.iconUrl} size={12} alt="" />
            ))}
          </span>
        ) : null}
      </button>
    </li>
  );
}
