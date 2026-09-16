"use client";

import type { TraitDetailBook } from "@/lib/curated/trait-details";
import { isOneAwayFromBreakpoint, type TraitCount } from "@/lib/curated/traits";
import { TraitDetails } from "./comp-details";
import { HoverTip, useHoverTip } from "./hover-tip";
import { TraitBreakpoints, TraitHex } from "./trait-badge";

/**
 * Every trait on a comp's board with its count and breakpoints, inactive ones dimmed.
 * Each row opens the trait tooltip; `board` is the fielded champions' names, which is
 * what the tooltip matches its member portraits against.
 */
export function CompTraitList({
  traits,
  details,
  board,
  onHoverTrait,
  showNearBreakpoints = false,
}: {
  traits: TraitCount[];
  details: TraitDetailBook;
  board: string[];
  onHoverTrait?: (traitName: string | null) => void;
  showNearBreakpoints?: boolean;
}) {
  const tip = useHoverTip<TraitCount>();
  const onBoard = new Set(board);

  return (
    <>
      <ul className="space-y-0.5">
        {traits.map((trait) => {
          const trigger = tip.triggerProps(trait);
          const isNearBp = showNearBreakpoints && isOneAwayFromBreakpoint(trait);

          return (
            <li key={trait.apiName}>
              <button
                type="button"
                {...trigger}
                onPointerEnter={(event) => {
                  trigger.onPointerEnter(event);
                  if (event.pointerType === "mouse") onHoverTrait?.(trait.name);
                }}
                onPointerLeave={(event) => {
                  trigger.onPointerLeave(event);
                  if (event.pointerType === "mouse") onHoverTrait?.(null);
                }}
                onFocus={(event) => {
                  trigger.onFocus(event);
                  onHoverTrait?.(trait.name);
                }}
                onBlur={() => {
                  trigger.onBlur();
                  onHoverTrait?.(null);
                }}
                // The negative margin gives the hover padding back, so a 15rem panel still fits "Elderwood".
                className={`group -mx-1 flex w-[calc(100%+0.5rem)] items-center gap-2 rounded px-1 py-0.5 text-left transition-colors hover:bg-raised ${
                  trait.level > 0 ? "" : "opacity-50"
                }`}
              >
                <TraitHex trait={trait} size={22} />
                <span className="w-4 text-right font-semibold">{trait.count}</span>
                <span className="min-w-0 flex-1 truncate">{trait.name}</span>
                {isNearBp ? (
                  <span
                    title="1 unit away from next breakpoint"
                    className="shrink-0 rounded border border-accent/40 bg-accent/15 px-1 py-0.5 text-[10px] font-semibold leading-none text-accent"
                  >
                    +1 away
                  </span>
                ) : null}
                <span className="text-xs">
                  <TraitBreakpoints trait={trait} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {tip.active ? (
        <HoverTip id={tip.id} anchor={tip.active.anchor} wide>
          <TraitDetails trait={tip.active.item} detail={details[tip.active.item.apiName]} onBoard={onBoard} />
        </HoverTip>
      ) : null}
    </>
  );
}
