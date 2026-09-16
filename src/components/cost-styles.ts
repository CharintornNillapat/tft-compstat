/** Tailwind classes per champion cost, spelled out in full so Tailwind can see them. */

export const COST_BORDER: Record<number, string> = {
  1: "border-cost-1",
  2: "border-cost-2",
  3: "border-cost-3",
  4: "border-cost-4",
  5: "border-cost-5",
};

export const COST_BG: Record<number, string> = {
  1: "bg-cost-1",
  2: "bg-cost-2",
  3: "bg-cost-3",
  4: "bg-cost-4",
  5: "bg-cost-5",
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

export const COST_GLOW: Record<number, string> = {
  1: "group-hover:drop-shadow-[0_0_8px_rgba(161,161,170,0.45)]",
  2: "group-hover:drop-shadow-[0_0_8px_rgba(34,197,94,0.55)]",
  3: "group-hover:drop-shadow-[0_0_8px_rgba(59,130,246,0.6)]",
  4: "group-hover:drop-shadow-[0_0_10px_rgba(168,85,247,0.65)]",
  5: "group-hover:drop-shadow-[0_0_12px_rgba(245,158,11,0.7)]",
};
