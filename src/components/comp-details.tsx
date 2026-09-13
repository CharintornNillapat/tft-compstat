import type { CompUnit } from "@/lib/curated/queries";
import { MISSING_TRAIT_TEXT, type TraitDetail } from "@/lib/curated/trait-details";
import type { TraitCount } from "@/lib/curated/traits";
import { ChampionIcon } from "./champion-icon";
import { COST_TEXT } from "./cost-styles";
import { ItemIcon } from "./item-icon";
import { TraitBreakpoints, TraitHex, TraitTierMin } from "./trait-badge";

const STAR_TEXT: Record<number, string> = {
  1: "text-trait-bronze",
  2: "text-trait-silver",
  // Emerald, not a third metal (architecture §9): 3-star is a reroll target rather
  // than one more rung, and gold stars sat right on top of the gold 5-cost border.
  3: "text-star-3",
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

/**
 * Tooltip body for a trait: its description, each breakpoint's bonus (reached ones in
 * the trait's style) and every champion that has it. `onBoard` holds the fielded
 * champions' names; members not among them are dimmed. Without synced text it falls
 * back to the bare breakpoints and says the description is missing.
 */
export function TraitDetails({
  trait,
  detail,
  onBoard,
}: {
  trait: TraitCount;
  detail?: TraitDetail;
  onBoard?: ReadonlySet<string>;
}) {
  const described = detail?.tiers.some((tier) => tier.text !== null) ?? false;
  const description = detail?.description ?? (described ? null : MISSING_TRAIT_TEXT);

  return (
    <div className="w-72 max-w-full">
      <p className="flex items-center gap-1.5">
        <TraitHex trait={trait} size={16} />
        <span className="font-semibold text-fg">{trait.name}</span>
        <span className="ml-auto text-muted">
          {trait.count} {trait.count === 1 ? "unit" : "units"}
        </span>
      </p>
      {description ? (
        <p className={`mt-1 whitespace-pre-line ${detail?.description ? "text-muted" : "text-faint italic"}`}>
          {description}
        </p>
      ) : null}
      {described && detail ? (
        <ul aria-label="Bonuses" className="mt-1.5 space-y-1">
          {detail.tiers.map((tier, i) => (
            <li key={tier.min} className="flex items-start gap-1.5">
              <TraitTierMin min={tier.min} style={tier.style} reached={i < trait.level} />
              <span className={`min-w-0 whitespace-pre-line ${i < trait.level ? "text-fg" : "text-muted"}`}>
                {tier.text ?? "—"}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-muted">
          <TraitBreakpoints trait={trait} />
        </p>
      )}
      {detail?.members.length ? (
        <div className="mt-2 border-t border-line pt-1.5">
          <p className="mb-1 text-[10px] tracking-wider text-faint uppercase">
            Champions{onBoard ? " · dimmed ones are not on this board" : ""}
          </p>
          <ul className="flex flex-wrap gap-1">
            {detail.members.map((member) => {
              const fielded = onBoard?.has(member.name) ?? true;
              return (
                <li key={member.apiName} className={fielded ? "" : "opacity-40"}>
                  <ChampionIcon
                    name={member.name}
                    cost={member.cost}
                    iconUrl={member.iconUrl}
                    size={24}
                    alt={onBoard && fielded ? `${member.name}, on this board` : member.name}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
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

/**
 * A comp that wins more than it is played. The word "Gem" and the ◆ glyph both carry
 * the meaning, so the amber is reinforcement rather than the only channel.
 */
export function GemBadge({ className = "", title }: { className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border border-gem/40 bg-gem/10 px-1.5 py-px text-[10px] font-semibold tracking-wide text-gem uppercase ${className}`}
    >
      <span aria-hidden>◆</span>
      Gem
    </span>
  );
}

/** What a Gem badge means, for its tooltip and its accessible name alike. */
export const GEM_TOOLTIP = "This comp has a low pick rate but a high top 4 rate.";

const ORDINALS: Record<number, string> = { 1: "1st", 2: "2nd", 3: "3rd" };

/** Item priority chip pinned above an itemized unit: who gets the components first. */
export function PriorityChip({ priority, className = "" }: { priority: number; className?: string }) {
  return (
    <span
      role="img"
      aria-label={`Item priority ${ORDINALS[priority] ?? priority}`}
      className={`rounded-sm bg-surface/90 px-1 text-[9px] leading-[1.3] font-bold text-carry ring-1 ring-carry/50 ${className}`}
    >
      {ORDINALS[priority] ?? priority}
    </span>
  );
}
