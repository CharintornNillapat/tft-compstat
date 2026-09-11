"use client";

import { Fragment } from "react";
import type { ItemTierEntry, ItemTierList } from "@/lib/curated/queries";
import { ITEM_KIND_LABELS } from "@/lib/static/game";
import { HoverTip, useHoverTip } from "./hover-tip";
import { ItemIcon } from "./item-icon";
import { NoteDot, TierRow } from "./tier-row";

/** Item tier rows grouped by kind, with hover details (recipe, emblem trait, note). */
export function ItemTierBoard({ groups }: { groups: ItemTierList["groups"] }) {
  const tip = useHoverTip<ItemTierEntry>();

  return (
    <div className="space-y-4">
      {groups.map(({ kind, tiers }) => (
        <section key={kind} aria-labelledby={`items-${kind}`}>
          <h2 id={`items-${kind}`} className="mb-1.5 text-[11px] font-medium tracking-wider text-faint uppercase">
            {ITEM_KIND_LABELS[kind]}
          </h2>
          <div className="divide-y divide-line rounded-md border border-line bg-panel px-2">
            {tiers.map(({ tier, entries }) => (
              <TierRow key={tier} tier={tier}>
                {entries.map((entry) => (
                  <button
                    key={entry.apiName}
                    type="button"
                    {...tip.triggerProps(entry)}
                    className="relative rounded-md p-0.5 hover:bg-raised"
                  >
                    <ItemIcon name={entry.name} iconUrl={entry.iconUrl} size={40} />
                    {entry.note ? <NoteDot /> : null}
                  </button>
                ))}
              </TierRow>
            ))}
          </div>
        </section>
      ))}
      {tip.active ? (
        <HoverTip id={tip.id} anchor={tip.active.anchor}>
          <ItemDetails entry={tip.active.item} />
        </HoverTip>
      ) : null}
    </div>
  );
}

function ItemDetails({ entry }: { entry: ItemTierEntry }) {
  return (
    <>
      <p className="font-semibold text-fg">{entry.name}</p>
      {entry.grantsTrait ? <p className="text-muted">Grants {entry.grantsTrait}</p> : null}
      {entry.components.length ? (
        <p className="mt-1 flex flex-wrap items-center gap-1 text-muted">
          {entry.components.map((component, i) => (
            <Fragment key={i}>
              {i > 0 ? <span aria-hidden>+</span> : null}
              <ItemIcon name={component.name} iconUrl={component.iconUrl} size={16} alt="" />
              <span>{component.name}</span>
            </Fragment>
          ))}
        </p>
      ) : null}
      {entry.note ? <p className="mt-1.5 border-t border-line pt-1.5 text-fg">{entry.note}</p> : null}
    </>
  );
}
