import { CHAMPION_COSTS, type ChampionCost } from "@/lib/static/game";
import { COST_SELECTED, COST_TEXT } from "./cost-styles";

const BUTTON = "h-7 min-w-7 rounded border px-2 font-semibold transition-colors";

/** Toggles for champion costs 1–5. An empty selection means every cost. */
export function CostFilter({
  selected,
  onChange,
}: {
  selected: ReadonlySet<ChampionCost>;
  onChange: (next: ReadonlySet<ChampionCost>) => void;
}) {
  const toggle = (cost: ChampionCost) => {
    const next = new Set(selected);
    if (!next.delete(cost)) next.add(cost);
    onChange(next);
  };

  return (
    <div role="group" aria-label="Filter by cost" className="flex items-center gap-1">
      <button
        type="button"
        aria-pressed={selected.size === 0}
        onClick={() => onChange(new Set())}
        className={`${BUTTON} ${
          selected.size === 0 ? "border-accent/60 bg-accent/10 text-fg" : "border-line text-muted hover:text-fg"
        }`}
      >
        All
      </button>
      {CHAMPION_COSTS.map((cost) => (
        <button
          key={cost}
          type="button"
          aria-pressed={selected.has(cost)}
          aria-label={`${cost}-cost`}
          onClick={() => toggle(cost)}
          className={`${BUTTON} ${COST_TEXT[cost]} ${
            selected.has(cost) ? COST_SELECTED[cost] : "border-line hover:bg-raised"
          }`}
        >
          {cost}
        </button>
      ))}
    </div>
  );
}
