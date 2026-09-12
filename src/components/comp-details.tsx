import type { CompUnit } from "@/lib/curated/queries";
import type { TraitCount } from "@/lib/curated/traits";
import { COST_TEXT } from "./cost-styles";
import { ItemIcon } from "./item-icon";
import { TraitBreakpoints, TraitHex } from "./trait-badge";

const STAR_TEXT: Record<number, string> = {
  1: "text-trait-bronze",
  2: "text-trait-silver",
  3: "text-trait-gold",
};

/** ★★ in the star level's color (bronze, silver, gold). */
export function StarPips({ star, className = "" }: { star: number; className?: string }) {
  return (
    <span
      role="img"
      aria-label={`${star}-star`}
      className={`leading-none -tracking-widest [text-shadow:0_1px_2px_rgb(0_0_0/0.9)] ${STAR_TEXT[star] ?? ""} ${className}`}
    >
      {"★".repeat(star)}
    </span>
  );
}

/** Tooltip body for a unit on a comp board. */
export function UnitDetails({ unit }: { unit: CompUnit }) {
  return (
    <>
      <p className="flex items-baseline gap-2">
        <span className="font-semibold text-fg">{unit.name}</span>
        <span className={COST_TEXT[unit.cost]}>{unit.cost}-cost</span>
        <StarPips star={unit.star} />
        {unit.isCarry ? (
          <span className="inline-flex items-center gap-1 text-carry">
            <CarryMark /> Carry
          </span>
        ) : null}
      </p>
      {unit.traits.length ? <p className="text-muted">{unit.traits.join(" · ")}</p> : null}
      {unit.items.length ? (
        <ul className="mt-1.5 space-y-1 border-t border-line pt-1.5">
          {unit.items.map((item, i) => (
            <li key={i} className="flex items-center gap-1.5 text-fg">
              <ItemIcon name={item.name} iconUrl={item.iconUrl} size={16} alt="" />
              {item.name}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

/** Tooltip body for a trait: name, count and breakpoints. */
export function TraitDetails({ trait }: { trait: TraitCount }) {
  return (
    <>
      <p className="flex items-center gap-1.5">
        <TraitHex trait={trait} size={16} />
        <span className="font-semibold text-fg">{trait.name}</span>
      </p>
      <p className="mt-0.5 text-muted">
        {trait.count} {trait.count === 1 ? "unit" : "units"} · <TraitBreakpoints trait={trait} />
      </p>
    </>
  );
}

/**
 * The carry marker: a crosshair on a dark disc. A **shape**, not only a colour —
 * the old treatment was a gold rim, which read as the 5-cost cost border, so a
 * 5-cost carry was indistinguishable from an ordinary 5-cost (the Phase 3 nit).
 */
export function CarryMark({ className = "" }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Carry"
      className={`grid size-3.5 place-items-center rounded-full bg-surface/90 ring-1 ring-carry/70 ${className}`}
    >
      <svg viewBox="0 0 12 12" className="size-2.5 stroke-carry" fill="none" strokeWidth={1.5}>
        <circle cx="6" cy="6" r="2.5" />
        <path d="M6 0.5v2M6 9.5v2M0.5 6h2M9.5 6h2" strokeLinecap="round" />
      </svg>
    </span>
  );
}
