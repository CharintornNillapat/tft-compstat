"use client";

import { useState } from "react";
import { groupChampionsByCost } from "@/lib/curated/champion-groups";
import type { ChampionTierEntry, ChampionTierList } from "@/lib/curated/queries";
import { isChampionCost, type ChampionCost } from "@/lib/static/game";
import { ChampionIcon } from "./champion-icon";
import { CostFilter } from "./cost-filter";
import { CostRow } from "./cost-row";
import { COST_TEXT } from "./cost-styles";
import { HoverTip, useHoverTip } from "./hover-tip";
import { Segmented } from "./segmented";
import { NoteDot, TierBadge, TierRow } from "./tier-row";
import { AbilityBlock } from "./tooltip-text";

const GROUPINGS = [
  { value: "cost", label: "Cost" },
  { value: "tier", label: "Tier" },
] as const;

type Grouping = (typeof GROUPINGS)[number]["value"];

/**
 * The champion board, grouped either way (architecture §9).
 *
 * **Cost** is the default: it answers "what should I buy at this stage?", which is the
 * question in front of you while the shop is open. **Tier** stays available because it
 * answers the one the page is named after, and the curated data is tier-first.
 *
 * Both views render the same entries from the same props — the cost rows are a pure
 * regrouping — so the cost filter, the tooltip and the note dots behave identically.
 */
export function ChampionTierBoard({ tiers }: { tiers: ChampionTierList["tiers"] }) {
  const [grouping, setGrouping] = useState<Grouping>("cost");
  const [costs, setCosts] = useState<ReadonlySet<ChampionCost>>(() => new Set());
  const tip = useHoverTip<ChampionTierEntry>();

  const visible = tiers.map(({ tier, entries }) => ({
    tier,
    entries: costs.size === 0 ? entries : entries.filter((e) => isChampionCost(e.cost) && costs.has(e.cost)),
  }));
  const count = visible.reduce((sum, { entries }) => sum + entries.length, 0);
  // A filtered-out cost has no row to show, so drop it rather than render an em dash
  // for a cost the reader just asked to hide.
  const costGroups = groupChampionsByCost(visible).filter(
    (group) => costs.size === 0 || group.entries.length > 0,
  );

  return (
    <section aria-label="Champion tiers">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Segmented label="Group by" options={GROUPINGS} value={grouping} onChange={setGrouping} />
        <p className="text-muted" aria-live="polite">
          {count} {count === 1 ? "champion" : "champions"}
        </p>
        <CostFilter selected={costs} onChange={setCosts} />
      </div>

      <div className="divide-y divide-line rounded-md border border-line bg-panel px-2">
        {grouping === "cost"
          ? costGroups.map(({ cost, entries }) => (
              <CostRow key={cost} cost={cost}>
                {entries.map((entry) => (
                  <ChampionCell key={entry.apiName} entry={entry} tip={tip} showTier />
                ))}
              </CostRow>
            ))
          : visible.map(({ tier, entries }) => (
              <TierRow key={tier} tier={tier}>
                {entries.map((entry) => (
                  <ChampionCell key={entry.apiName} entry={entry} tip={tip} />
                ))}
              </TierRow>
            ))}
      </div>

      {tip.active ? (
        <HoverTip id={tip.id} anchor={tip.active.anchor} wide={tip.active.item.ability !== null}>
          <ChampionDetails entry={tip.active.item} />
        </HoverTip>
      ) : null}
    </section>
  );
}

function ChampionCell({
  entry,
  tip,
  showTier = false,
}: {
  entry: ChampionTierEntry;
  tip: ReturnType<typeof useHoverTip<ChampionTierEntry>>;
  /** Cost rows only: the tier row's own label already says it. */
  showTier?: boolean;
}) {
  return (
    <button
      type="button"
      {...tip.triggerProps(entry)}
      className="group flex w-12 flex-col items-center gap-0.5 rounded-md p-0.5 hover:bg-raised"
    >
      <span className="relative">
        <ChampionIcon name={entry.name} cost={entry.cost} iconUrl={entry.iconUrl} alt="" />
        {/* Left-to-right order is the only other signal that a row is ranked, and it
            is invisible once a row wraps — so the rating is spelled out on the icon. */}
        {showTier ? (
          <TierBadge
            tier={entry.tier}
            className="absolute -top-1 -left-1 size-4 text-[10px] ring-1 ring-panel"
          />
        ) : null}
        {entry.note ? <NoteDot /> : null}
      </span>
      <span className="w-full truncate text-center text-[10px] leading-tight text-muted group-hover:text-fg">
        {entry.name}
      </span>
    </button>
  );
}

function ChampionDetails({ entry }: { entry: ChampionTierEntry }) {
  return (
    <>
      <p className="flex items-baseline gap-2">
        <span className="font-semibold text-fg">{entry.name}</span>
        <span className={COST_TEXT[entry.cost]}>{entry.cost}-cost</span>
        <span className="flex items-center gap-1 text-muted">
          <TierBadge tier={entry.tier} className="size-4 text-[10px]" />
          tier
        </span>
      </p>
      {entry.traits.length ? <p className="text-muted">{entry.traits.join(" · ")}</p> : null}
      {entry.ability ? <AbilityBlock ability={entry.ability} /> : null}
      {entry.note ? <p className="mt-1.5 border-t border-line pt-1.5 text-fg">{entry.note}</p> : null}
    </>
  );
}
