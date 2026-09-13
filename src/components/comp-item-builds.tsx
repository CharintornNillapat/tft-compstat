"use client";

import type { CompItem, CompUnit } from "@/lib/curated/queries";
import { ChampionIcon } from "./champion-icon";
import { CarryMark, ordinal, PriorityChip, StarPips } from "./comp-details";
import { HoverTip, useHoverTip } from "./hover-tip";
import { ItemIcon } from "./item-icon";

type Tip = ReturnType<typeof useHoverTip<CompItem>>;

/**
 * A comp's itemized units. Carries and units with a stated item priority get a full
 * row: portrait, name, star goal, role, then the items. Every other holder — mostly a
 * lone Thief's Gloves on a generated board — shares one wrapping row of chips below,
 * since six one-item rows made the column twice the guide's height beside it.
 *
 * Item names live in the shared tooltip rather than beside each icon. The icons are
 * buttons so it opens on tap and keyboard focus too, the same as `/bis`; the tooltip
 * is the only reason this is a client component.
 */
export function CompItemBuilds({ units }: { units: CompUnit[] }) {
  const tip = useHoverTip<CompItem>();
  const builds = units.filter((unit) => unit.isCarry || unit.carryPriority !== null);
  const holders = units.filter((unit) => !builds.includes(unit));

  return (
    <>
      {builds.length ? (
        <ul className="divide-y divide-line">
          {builds.map((unit) => (
            <li key={unit.apiName} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="relative shrink-0">
                  <ChampionIcon name={unit.name} cost={unit.cost} iconUrl={unit.iconUrl} size={36} alt="" />
                  {unit.carryPriority ? (
                    <PriorityChip priority={unit.carryPriority} className="absolute -top-1 -left-1" />
                  ) : null}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium">{unit.name}</p>
                  <p className="flex items-center gap-1.5 text-[11px]">
                    <StarPips star={unit.star} />
                    <RoleTag unit={unit} />
                  </p>
                </div>
              </div>
              <ItemButtons unit={unit} tip={tip} size={32} className="shrink-0" />
            </li>
          ))}
        </ul>
      ) : null}

      {holders.length ? (
        <div className={builds.length ? "mt-2 border-t border-line pt-2" : ""}>
          <p className="mb-1.5 text-[11px] text-faint">Other item holders</p>
          <ul className="flex flex-wrap gap-1.5">
            {holders.map((unit) => (
              <li
                key={unit.apiName}
                className="flex items-center gap-1.5 rounded-md border border-line bg-raised/40 py-0.5 pr-0.5 pl-1"
              >
                <ChampionIcon name={unit.name} cost={unit.cost} iconUrl={unit.iconUrl} size={24} alt="" />
                <span className="max-w-20 truncate text-[11px] text-muted">{unit.name}</span>
                <ItemButtons unit={unit} tip={tip} size={22} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {tip.active ? (
        <HoverTip id={tip.id} anchor={tip.active.anchor}>
          <p className="font-semibold text-fg">{tip.active.item.name}</p>
        </HoverTip>
      ) : null}
    </>
  );
}

function ItemButtons({ unit, tip, size, className = "" }: { unit: CompUnit; tip: Tip; size: number; className?: string }) {
  return (
    <ul aria-label={`${unit.name} items`} className={`flex gap-0.5 ${className}`}>
      {unit.items.map((item, i) => (
        <li key={i} className="flex">
          <button type="button" {...tip.triggerProps(item)} className="rounded-md p-0.5 hover:bg-raised">
            <ItemIcon name={item.name} iconUrl={item.iconUrl} size={size} />
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * "1st carry" for a carry with a stated priority, "2nd priority" for a unit that takes
 * components early without carrying (a tank's defensive items), or "Carry". The carry
 * tag leads with `CarryMark` so shape carries it too.
 */
function RoleTag({ unit }: { unit: CompUnit }) {
  const priority = unit.carryPriority ? ordinal(unit.carryPriority) : null;
  if (unit.isCarry) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-carry/40 bg-carry/10 py-px pr-1.5 pl-0.5 leading-none font-semibold text-carry">
        <CarryMark className="size-3" />
        {priority ? `${priority} carry` : "Carry"}
      </span>
    );
  }
  return <span className="rounded-full border border-line px-1.5 py-px leading-none text-muted">{priority} priority</span>;
}
