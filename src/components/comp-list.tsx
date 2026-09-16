"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { isContested } from "@/lib/curated/comp-badges";
import { filterComps, normalize } from "@/lib/curated/comp-filter";
import type { CompSummary, CompUnit } from "@/lib/curated/queries";
import type { TraitDetailBook } from "@/lib/curated/trait-details";
import type { TraitCount } from "@/lib/curated/traits";
import { COMP_STYLE_LABELS, COMP_STYLES, TIER_RANKS, type CompStyle, type TierRank } from "@/lib/static/game";
import { ChampionIcon } from "./champion-icon";
import { CONTESTED_TOOLTIP, ContestedBadge, DifficultyBadge, PlaystyleBadge } from "./comp-badges";
import { GEM_TOOLTIP, GemBadge, PriorityChip, StarPips, TraitDetails, UnitDetails } from "./comp-details";
import { CompStatsRow } from "./comp-stats";
import { EmptyState } from "./empty-state";
import { HoverTip, useHoverTip } from "./hover-tip";
import { ItemIcon } from "./item-icon";
import { TierBadge } from "./tier-row";
import { TraitHex } from "./trait-badge";
import {
  sortComps,
  type CompSortKey,
  type SortDirection,
  DEFAULT_SORT_DIRECTIONS,
} from "@/lib/curated/comp-sort";
import { TOGGLE_BUTTON, TOGGLE_OFF, TOGGLE_ON, ToggleGroup } from "./toggle-group";

/** A meta badge's tooltip carries no data of its own, only which badge it was. */
type BadgeTip = { badge: "gem" | "contested" };
type TipItem = CompUnit | TraitCount | BadgeTip;
type Tip = ReturnType<typeof useHoverTip<TipItem>>;

const GEM_TIP: BadgeTip = { badge: "gem" };
const CONTESTED_TIP: BadgeTip = { badge: "contested" };
const BADGE_TOOLTIPS: Record<BadgeTip["badge"], string> = { gem: GEM_TOOLTIP, contested: CONTESTED_TOOLTIP };

const SORT_OPTIONS: readonly {
  key: CompSortKey;
  label: string;
  defaultDir: SortDirection;
  hint: { asc: string; desc: string };
}[] = [
  {
    key: "tier",
    label: "Tier",
    defaultDir: "asc",
    hint: { asc: "S → C tier", desc: "C → S tier" },
  },
  {
    key: "avg",
    label: "Avg Place",
    defaultDir: "asc",
    hint: { asc: "Best placement first", desc: "Worst placement first" },
  },
  {
    key: "top4",
    label: "Top 4 %",
    defaultDir: "desc",
    hint: { asc: "Lowest top-4 rate first", desc: "Highest top-4 rate first" },
  },
  {
    key: "pick",
    label: "Pick Rate",
    defaultDir: "desc",
    hint: { asc: "Lowest pick rate first", desc: "Highest pick rate first" },
  },
] as const;

function SortDirectionIcon({ direction }: { direction: SortDirection }) {
  return (
    <svg
      viewBox="0 0 10 10"
      aria-hidden="true"
      className="size-2.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {direction === "asc" ? (
        <path d="M5 8V2M2.5 4.5 5 2l2.5 2.5" />
      ) : (
        <path d="M5 2v6M2.5 5.5 5 8l2.5-2.5" />
      )}
    </svg>
  );
}

/** Dense comp rows with tier/style filters, sort controls and search; units, traits and badges show details on hover. */
export function CompList({ comps, traitDetails }: { comps: CompSummary[]; traitDetails: TraitDetailBook }) {
  const [tiers, setTiers] = useState<ReadonlySet<TierRank>>(() => new Set());
  const [styles, setStyles] = useState<ReadonlySet<CompStyle>>(() => new Set());
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<CompSortKey>("tier");
  const [direction, setDirection] = useState<SortDirection>("asc");
  const tip = useHoverTip<TipItem>();

  const tierOptions = TIER_RANKS.filter((tier) => comps.some((comp) => comp.tier === tier)).map((tier) => ({
    value: tier,
    label: tier,
  }));
  const styleOptions = COMP_STYLES.filter((style) => comps.some((comp) => comp.style === style)).map((style) => ({
    value: style,
    label: COMP_STYLE_LABELS[style],
  }));

  // Extract prominent carry units across comps to offer one-click carry filters
  const topCarries = useMemo(() => {
    const carryMap = new Map<string, { count: number; unit: CompUnit }>();
    for (const comp of comps) {
      for (const unit of comp.units) {
        if (unit.isCarry) {
          const entry = carryMap.get(unit.name);
          if (entry) {
            entry.count += 1;
          } else {
            carryMap.set(unit.name, { count: 1, unit });
          }
        }
      }
    }
    return Array.from(carryMap.values())
      .sort((a, b) => b.count - a.count || b.unit.cost - a.unit.cost || a.unit.name.localeCompare(b.unit.name))
      .slice(0, 10)
      .map((entry) => entry.unit);
  }, [comps]);

  const filtered = filterComps(comps, { tiers, styles, query });
  const visible = sortComps(filtered, sortKey, direction);

  const isFiltered = query.trim() !== "" || tiers.size > 0 || styles.size > 0;
  const isCustomSort = sortKey !== "tier" || direction !== "asc";
  const canReset = isFiltered || isCustomSort;

  const handleReset = () => {
    setQuery("");
    setTiers(new Set());
    setStyles(new Set());
    setSortKey("tier");
    setDirection("asc");
  };

  const handleSortChange = (key: CompSortKey) => {
    if (key === sortKey) {
      setDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setDirection(DEFAULT_SORT_DIRECTIONS[key]);
    }
  };

  return (
    <section aria-label="Comps">
      <div className="mb-3 space-y-2">
        {/* Top bar: Search input + comp counter & Reset button */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="relative w-full sm:w-64">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search comps, units, traits, items..."
              aria-label="Search comps"
              className="h-7 w-full min-w-0 rounded border border-line bg-panel pr-7 pl-2 text-xs placeholder:text-faint focus:border-accent focus:outline-none"
            />
            {!query && (
              <kbd
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border border-line/80 bg-raised/70 px-1 py-px font-mono text-[10px] leading-none text-faint"
              >
                /
              </kbd>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted sm:ml-auto">
            {canReset ? (
              <button
                type="button"
                onClick={handleReset}
                className="text-accent hover:underline"
              >
                Reset filters
              </button>
            ) : null}
            <p className="tabular-nums text-muted" aria-live="polite">
              {visible.length === comps.length ? comps.length : `${visible.length} of ${comps.length}`}{" "}
              {comps.length === 1 ? "comp" : "comps"}
            </p>
          </div>
        </div>

        {/* Carry Champion Quick Filters */}
        {topCarries.length > 0 ? (
          <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 text-xs">
            <span className="shrink-0 text-[11px] font-medium tracking-wider text-faint uppercase">Carries</span>
            <div className="flex flex-wrap items-center gap-1">
              {topCarries.map((carry) => {
                const isSelected = normalize(query) === normalize(carry.name);
                return (
                  <button
                    key={carry.apiName}
                    type="button"
                    onClick={() => setQuery(isSelected ? "" : carry.name)}
                    aria-pressed={isSelected}
                    title={isSelected ? `Clear filter for ${carry.name}` : `Filter comps with ${carry.name} carry`}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium transition-all ${
                      isSelected
                        ? "border-accent bg-accent/15 text-accent shadow-[0_0_8px_rgba(200,170,110,0.25)]"
                        : "border-line bg-panel text-muted hover:border-zinc-500 hover:bg-raised hover:text-fg"
                    }`}
                  >
                    <ChampionIcon name={carry.name} cost={carry.cost} iconUrl={carry.iconUrl} size={16} alt="" />
                    <span>{carry.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Filters and Sort Controls */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line/60 pt-2 text-xs">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium tracking-wider text-faint uppercase">Tier</span>
              <ToggleGroup label="Filter by tier" options={tierOptions} selected={tiers} onChange={setTiers} />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium tracking-wider text-faint uppercase">Style</span>
              <ToggleGroup label="Filter by style" options={styleOptions} selected={styles} onChange={setStyles} />
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium tracking-wider text-faint uppercase">Sort</span>
            <div role="group" aria-label="Sort comps" className="flex flex-wrap items-center gap-1">
              {SORT_OPTIONS.map((opt) => {
                const isActive = sortKey === opt.key;
                const hint = isActive ? opt.hint[direction] : opt.hint[opt.defaultDir];
                return (
                  <button
                    key={opt.key}
                    type="button"
                    aria-pressed={isActive}
                    aria-label={`Sort by ${opt.label}${isActive ? ` (${direction === "asc" ? "ascending" : "descending"})` : ""}`}
                    title={`${opt.label}: ${hint}. Click to ${isActive ? "reverse order" : "sort"}.`}
                    onClick={() => handleSortChange(opt.key)}
                    className={`${TOGGLE_BUTTON} ${isActive ? TOGGLE_ON : TOGGLE_OFF} flex items-center gap-1 text-xs`}
                  >
                    <span>{opt.label}</span>
                    {isActive ? <SortDirectionIcon direction={direction} /> : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {visible.length ? (
        <ol className="divide-y divide-line rounded-md border border-line bg-panel">
          {visible.map((comp) => (
            <CompRow key={comp.slug} comp={comp} tip={tip} sortKey={sortKey} />
          ))}
        </ol>
      ) : (
        <EmptyState title="No comps match">Clear a filter or change the search.</EmptyState>
      )}

      {tip.active ? (
        <HoverTip id={tip.id} anchor={tip.active.anchor} wide={"breakpoints" in tip.active.item}>
          {"badge" in tip.active.item ? (
            <p className="max-w-56">{BADGE_TOOLTIPS[tip.active.item.badge]}</p>
          ) : "breakpoints" in tip.active.item ? (
            <TraitTip trait={tip.active.item} comps={comps} details={traitDetails} />
          ) : (
            <UnitDetails unit={tip.active.item} />
          )}
        </HoverTip>
      ) : null}
    </section>
  );
}

/** Trait counts are built per comp, so the hovered object itself says whose board it is. */
function TraitTip({ trait, comps, details }: { trait: TraitCount; comps: CompSummary[]; details: TraitDetailBook }) {
  const owner = comps.find((comp) => comp.traits.includes(trait));
  return (
    <TraitDetails
      trait={trait}
      detail={details[trait.apiName]}
      onBoard={owner ? new Set(owner.units.map((unit) => unit.name)) : undefined}
    />
  );
}

function CompRow({ comp, tip, sortKey }: { comp: CompSummary; tip: Tip; sortKey: CompSortKey }) {
  const carries = comp.units.filter((unit) => unit.isCarry);
  const others = comp.units.filter((unit) => !unit.isCarry);

  return (
    <li
      className={`relative flex flex-wrap items-center gap-x-4 gap-y-2 px-2.5 py-2 transition-colors hover:bg-raised/40 ${
        comp.tier === "S" ? "border-l-2 border-l-tier-s bg-gradient-to-r from-tier-s/[0.04] to-transparent" : ""
      }`}
    >
      <div className="flex w-full min-w-0 items-start gap-2.5 sm:w-64 sm:shrink-0">
        <TierBadge tier={comp.tier} className="size-8 shrink-0 text-sm" />
        <div className="min-w-0 flex-1">
          {/* Wraps rather than shrinks: a long name plus its badges pushes the badges to
              the next line instead of eating into the name and truncating it. */}
          <h2 className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 font-semibold">
            {/* Stretched link: the whole row opens the guide; units, traits and the
                meta badges sit above it so their tooltips still work. */}
            <Link
              href={`/comps/${comp.slug}`}
              className="max-w-full truncate after:absolute after:inset-0 hover:text-accent"
            >
              {comp.name}
            </Link>
            {isContested(comp.pickRate) ? (
              <BadgeButton tip={tip} item={CONTESTED_TIP}>
                <ContestedBadge />
              </BadgeButton>
            ) : null}
            {comp.isGem ? (
              <BadgeButton tip={tip} item={GEM_TIP}>
                <GemBadge />
              </BadgeButton>
            ) : null}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <PlaystyleBadge style={comp.style} />
            <DifficultyBadge difficulty={comp.difficulty} />
          </div>
          {/* No level here: a fourth stat wraps this column onto a ragged second line. */}
          <CompStatsRow
            stats={comp}
            fields={["avg", "top4", "pick"]}
            highlightField={sortKey === "avg" ? "avg" : sortKey === "top4" ? "top4" : sortKey === "pick" ? "pick" : undefined}
            className="mt-1"
          />
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

function BadgeButton({ tip, item, children }: { tip: Tip; item: BadgeTip; children: ReactNode }) {
  return (
    <button
      type="button"
      {...tip.triggerProps(item)}
      aria-label={BADGE_TOOLTIPS[item.badge]}
      className="pointer-events-auto relative shrink-0 rounded-full"
    >
      {children}
    </button>
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
        {/* The chip and the pips are pinned over the portrait's top corners rather than
            stacked above it, so a row of units with and without them stays one height. */}
        <span className="relative">
          <ChampionIcon name={unit.name} cost={unit.cost} iconUrl={unit.iconUrl} size={36} alt="" />
          {unit.carryPriority ? (
            <PriorityChip priority={unit.carryPriority} className="absolute -top-1 -left-1" />
          ) : null}
          {unit.star === 3 ? (
            <StarPips star={3} className="absolute -top-1 right-0 text-[9px]" />
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
