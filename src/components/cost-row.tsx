import { Children, type ReactNode } from "react";
import { COST_BG, COST_TEXT } from "./cost-styles";

/**
 * One shelf of the cost view: a cost label, then a wrapping row of entries. Deliberately
 * the same shape as `TierRow` — label column, `min-h-11` body, em dash when empty — so
 * the two groupings of the same board read as one layout rather than two.
 *
 * The label is a tinted plate rather than a solid one like `TierBadge`: "1-cost" is five
 * times the width of "S", and five saturated blocks down the left edge would outweigh the
 * champion icons they exist to label.
 */
export function CostRow({ cost, children }: { cost: number; children?: ReactNode }) {
  return (
    <div className="flex gap-2.5 py-2">
      <div
        className={`flex w-14 shrink-0 items-center justify-center self-stretch rounded border-l-2 text-xs font-semibold ${
          COST_TEXT[cost] ?? "text-muted"
        } ${COST_BG[cost] ? `${COST_BG[cost]}/10 border-l-current` : "border-line bg-raised"}`}
      >
        {cost}-cost
      </div>
      <div className="flex min-h-11 min-w-0 flex-1 flex-wrap content-start items-start gap-1">
        {Children.count(children) > 0 ? children : <span className="self-center text-faint">—</span>}
      </div>
    </div>
  );
}
