"use client";

import type { BoardUnit, PlannerCatalog, Star } from "@/lib/planner/board";
import { MAX_UNIT_ITEMS } from "@/lib/static/game";
import { ChampionIcon } from "../champion-icon";
import { COST_TEXT } from "../cost-styles";
import { ItemIcon } from "../item-icon";
import { Segmented } from "../segmented";
import { TOGGLE_BUTTON, TOGGLE_OFF, TOGGLE_ON } from "../toggle-group";

const STAR_OPTIONS: readonly { value: Star; label: string }[] = [
  { value: 1, label: "1★" },
  { value: 2, label: "2★" },
  { value: 3, label: "3★" },
];

/** The selected unit: star level, its three item slots (tap one to remove it), move and remove. */
export function UnitInspector({
  unit,
  catalog,
  moving,
  onStar,
  onUnequip,
  onMove,
  onRemove,
}: {
  unit: BoardUnit | undefined;
  catalog: PlannerCatalog;
  moving: boolean;
  onStar: (star: Star) => void;
  onUnequip: (index: number) => void;
  onMove: () => void;
  onRemove: () => void;
}) {
  if (!unit) {
    return (
      <p className="text-xs text-muted">
        Tap a champion below, then a hex, to place it. Tap a unit on the board to set its stars and items.
      </p>
    );
  }

  const champion = catalog.champions[unit.apiName];
  const name = champion?.name ?? unit.apiName;
  const cost = champion?.cost ?? 0;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex min-w-0 items-center gap-2">
        <ChampionIcon name={name} cost={cost} iconUrl={champion?.iconUrl ?? null} size={40} alt="" />
        <div className="min-w-0">
          <p className="font-semibold">
            {name} <span className={`text-xs font-normal ${COST_TEXT[cost] ?? ""}`}>{cost}-cost</span>
          </p>
          <p className="truncate text-xs text-muted">
            {(champion?.traits ?? []).map((trait) => catalog.traitNames[trait] ?? trait).join(" · ")}
          </p>
        </div>
      </div>
      <Segmented label="Stars" options={STAR_OPTIONS} value={unit.star} onChange={onStar} />
      <div role="group" aria-label="Items" className="flex items-center gap-1">
        {Array.from({ length: MAX_UNIT_ITEMS }, (_, index) => {
          const apiName = unit.items[index];
          if (!apiName) {
            return <span key={index} aria-hidden className="block size-7 rounded border border-dashed border-line" />;
          }
          const item = catalog.items[apiName];
          return (
            <button
              key={index}
              type="button"
              onClick={() => onUnequip(index)}
              aria-label={`Remove ${item?.name ?? apiName}`}
              title={`${item?.name ?? apiName} — tap to remove`}
              className="relative rounded hover:opacity-70"
            >
              <ItemIcon name={item?.name ?? apiName} iconUrl={item?.iconUrl ?? null} size={28} alt="" />
              <span
                aria-hidden
                className="absolute -top-1 -right-1 grid size-3.5 place-items-center rounded-full bg-surface text-[9px] leading-none ring-1 ring-line"
              >
                ×
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex gap-1">
        <button type="button" aria-pressed={moving} onClick={onMove} className={`${TOGGLE_BUTTON} ${moving ? TOGGLE_ON : TOGGLE_OFF}`}>
          Move
        </button>
        <button type="button" onClick={onRemove} className={`${TOGGLE_BUTTON} ${TOGGLE_OFF}`}>
          Remove
        </button>
      </div>
    </div>
  );
}
