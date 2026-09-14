"use client";

import { useMemo, useState } from "react";
import type { PlannerChampion } from "@/lib/planner/board";
import { championLabels, filterChampions, traitOptions } from "@/lib/planner/catalog";
import type { ChampionCost } from "@/lib/static/game";
import { ChampionIcon } from "../champion-icon";
import { CostFilter } from "../cost-filter";
import type { usePointerDrag } from "./use-pointer-drag";

type Drag = ReturnType<typeof usePointerDrag>;

/**
 * Every champion of the set, Riftbeasts and each Lux form included, cheapest first.
 * Tap a tile to arm it and then tap a hex, or drag it onto the board with a mouse or pen.
 */
export function ChampionPicker({
  champions,
  traitNames,
  onBoard,
  armed,
  onPick,
  dragProps,
  wasDrag,
}: {
  champions: readonly PlannerChampion[];
  traitNames: Record<string, string>;
  onBoard: ReadonlySet<string>;
  armed: string | null;
  onPick: (apiName: string) => void;
  dragProps: Drag["dragProps"];
  wasDrag: Drag["wasDrag"];
}) {
  const [costs, setCosts] = useState<ReadonlySet<ChampionCost>>(new Set());
  const [trait, setTrait] = useState("");
  const [query, setQuery] = useState("");

  const labels = useMemo(() => championLabels(champions, traitNames), [champions, traitNames]);
  const traits = useMemo(() => traitOptions(champions, traitNames), [champions, traitNames]);
  const shown = filterChampions(
    champions,
    { costs: costs as ReadonlySet<number>, traits: new Set(trait ? [trait] : []), query },
    traitNames,
  );

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search champions or traits  ( / )"
          aria-label="Search champions"
          className="h-7 w-full min-w-0 rounded border border-line bg-panel px-2 placeholder:text-faint sm:w-60"
        />
        <CostFilter selected={costs} onChange={setCosts} />
        <select
          value={trait}
          onChange={(event) => setTrait(event.target.value)}
          aria-label="Filter by trait"
          className="h-7 max-w-full min-w-0 rounded border border-line bg-panel px-1.5"
        >
          <option value="">All traits</option>
          {traits.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {shown.length === 0 ? (
        <p className="py-4 text-center text-muted">No champions match.</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(3.5rem,1fr))] gap-1">
          {shown.map((champion) => {
            const isArmed = armed === champion.apiName;
            const fielded = onBoard.has(champion.apiName);
            return (
              <li key={champion.apiName}>
                <button
                  type="button"
                  aria-pressed={isArmed}
                  aria-label={`${labels[champion.apiName]}, ${champion.cost}-cost${fielded ? ", on the board" : ""}`}
                  title={champion.traits.map((apiName) => traitNames[apiName] ?? apiName).join(" · ")}
                  onClick={() => {
                    if (!wasDrag()) onPick(champion.apiName);
                  }}
                  {...dragProps({ type: "champion", apiName: champion.apiName })}
                  className={`flex w-full min-w-0 flex-col items-center gap-0.5 rounded p-1 select-none [-webkit-touch-callout:none] [&_img]:pointer-events-none ${
                    isArmed ? "bg-accent/15 ring-1 ring-accent/70" : "hover:bg-raised"
                  } ${fielded && !isArmed ? "opacity-50" : ""}`}
                >
                  <ChampionIcon name={champion.name} cost={champion.cost} iconUrl={champion.iconUrl} size={40} alt="" />
                  <span className="w-full truncate text-center text-[10px] leading-tight">{labels[champion.apiName]}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
