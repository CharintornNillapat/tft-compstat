/** Tailwind classes per champion cost, spelled out in full so Tailwind can see them. */

export const COST_BORDER: Record<number, string> = {
  1: "border-cost-1",
  2: "border-cost-2",
  3: "border-cost-3",
  4: "border-cost-4",
  5: "border-cost-5",
};

export const COST_TEXT: Record<number, string> = {
  1: "text-cost-1",
  2: "text-cost-2",
  3: "text-cost-3",
  4: "text-cost-4",
  5: "text-cost-5",
};

export const COST_SELECTED: Record<number, string> = {
  1: "border-cost-1 bg-cost-1/15",
  2: "border-cost-2 bg-cost-2/15",
  3: "border-cost-3 bg-cost-3/15",
  4: "border-cost-4 bg-cost-4/15",
  5: "border-cost-5 bg-cost-5/15",
};
