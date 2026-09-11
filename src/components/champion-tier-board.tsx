"use client";

import { useState } from "react";
import type { ChampionTierEntry, ChampionTierList } from "@/lib/curated/queries";
import { isChampionCost, type ChampionCost } from "@/lib/static/game";
import { ChampionIcon } from "./champion-icon";
import { CostFilter } from "./cost-filter";
import { COST_TEXT } from "./cost-styles";
import { HoverTip, useHoverTip } from "./hover-tip";
import { NoteDot, TierRow } from "./tier-row";

/** Champion tier rows with a cost filter and hover details (name, traits, note). */
export function ChampionTierBoard({ tiers }: { tiers: ChampionTierList["tiers"] }) {
  const [costs, setCosts] = useState<ReadonlySet<ChampionCost>>(() => new Set());
  const tip = useHoverTip<ChampionTierEntry>();

  const visible = tiers.map(({ tier, entries }) => ({
    tier,
    entries: costs.size === 0 ? entries : entries.filter((e) => isChampionCost(e.cost) && costs.has(e.cost)),
  }));
  const count = visible.reduce((sum, { entries }) => sum + entries.length, 0);

  return (
    <section aria-label="Champion tiers">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted">
          {count} {count === 1 ? "champion" : "champions"}
        </p>
        <CostFilter selected={costs} onChange={setCosts} />
      </div>
      <div className="divide-y divide-line rounded-md border border-line bg-panel px-2">
        {visible.map(({ tier, entries }) => (
          <TierRow key={tier} tier={tier}>
            {entries.map((entry) => (
              <button
                key={entry.apiName}
                type="button"
                {...tip.triggerProps(entry)}
                className="group flex w-12 flex-col items-center gap-0.5 rounded-md p-0.5 hover:bg-raised"
              >
                <span className="relative">
                  <ChampionIcon name={entry.name} cost={entry.cost} iconUrl={entry.iconUrl} alt="" />
                  {entry.note ? <NoteDot /> : null}
                </span>
                <span className="w-full truncate text-center text-[10px] leading-tight text-muted group-hover:text-fg">
                  {entry.name}
                </span>
              </button>
            ))}
          </TierRow>
        ))}
      </div>
      {tip.active ? (
        <HoverTip id={tip.id} anchor={tip.active.anchor}>
          <ChampionDetails entry={tip.active.item} />
        </HoverTip>
      ) : null}
    </section>
  );
}

function ChampionDetails({ entry }: { entry: ChampionTierEntry }) {
  return (
    <>
      <p className="flex items-baseline gap-2">
        <span className="font-semibold text-fg">{entry.name}</span>
        <span className={COST_TEXT[entry.cost]}>{entry.cost}-cost</span>
      </p>
      {entry.traits.length ? <p className="text-muted">{entry.traits.join(" · ")}</p> : null}
      {entry.note ? <p className="mt-1.5 border-t border-line pt-1.5 text-fg">{entry.note}</p> : null}
    </>
  );
}
