"use client";

import { useState } from "react";
import type { PlannerItem, PlannerItemKind } from "@/lib/planner/board";
import { filterItems } from "@/lib/planner/catalog";
import { ItemIcon } from "../item-icon";
import { Segmented } from "../segmented";
import type { usePointerDrag } from "./use-pointer-drag";

type Drag = ReturnType<typeof usePointerDrag>;

const KIND_OPTIONS: readonly { value: PlannerItemKind | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "completed", label: "Completed" },
  { value: "emblem", label: "Emblems" },
  { value: "artifact", label: "Artifacts" },
];

/** Completed items, emblems and artifacts. Tap one to give it to the selected unit, or drag it onto a unit. */
export function ItemPicker({
  items,
  traitNames,
  target,
  onPick,
  dragProps,
  wasDrag,
}: {
  items: readonly PlannerItem[];
  traitNames: Record<string, string>;
  /** The selected unit's name, or null. */
  target: string | null;
  onPick: (apiName: string) => void;
  dragProps: Drag["dragProps"];
  wasDrag: Drag["wasDrag"];
}) {
  const [kind, setKind] = useState<PlannerItemKind | "all">("all");
  const [query, setQuery] = useState("");
  const shown = filterItems(items, kind, query, traitNames);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search items  ( / )"
          aria-label="Search items"
          className="h-7 w-full min-w-0 rounded border border-line bg-panel px-2 placeholder:text-faint sm:w-60"
        />
        <Segmented label="Kind" options={KIND_OPTIONS} value={kind} onChange={setKind} />
      </div>
      <p className="mb-2 text-xs text-muted">
        {target ? (
          <>
            Giving items to <span className="text-fg">{target}</span>
          </>
        ) : (
          "Select a unit on the board, then tap an item — or drag an item onto a unit."
        )}
      </p>
      {shown.length === 0 ? (
        <p className="py-4 text-center text-muted">No items match.</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1">
          {shown.map((item) => {
            const grants = item.grantsTrait ? ` (${traitNames[item.grantsTrait] ?? item.grantsTrait})` : "";
            return (
              <li key={item.apiName}>
                <button
                  type="button"
                  aria-label={`${item.name}${grants}`}
                  title={item.name}
                  onClick={() => {
                    if (!wasDrag()) onPick(item.apiName);
                  }}
                  {...dragProps({ type: "item", apiName: item.apiName })}
                  className="grid w-full place-items-center rounded p-1 select-none hover:bg-raised [-webkit-touch-callout:none] [&_img]:pointer-events-none"
                >
                  <ItemIcon name={item.name} iconUrl={item.iconUrl} size={36} alt="" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
