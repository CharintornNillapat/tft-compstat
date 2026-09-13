import type { CompUnit } from "@/lib/curated/queries";
import { MISSING_TRAIT_TEXT, type TraitDetail } from "@/lib/curated/trait-details";
import type { TraitCount } from "@/lib/curated/traits";
import { TRAIT_KIND_LABELS } from "@/lib/static/game";
import { ChampionIcon } from "./champion-icon";
import { COST_TEXT } from "./cost-styles";
import { ItemIcon } from "./item-icon";
import { TraitBreakpoints, TraitHex } from "./trait-badge";

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
 * Tooltip body for a trait, laid out after OP.GG's (architecture §9): the name with its
 * type underneath, the description, the breakpoints as a numbered list with **only the
 * tier the board sits on** lit, then every champion that has the trait on its cost
 * border. `onBoard` holds the fielded champions' names; members not among them are
 * dimmed. Without synced text it falls back to the bare breakpoints and says so.
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
  // `level` counts the breakpoints reached, so the board sits on the last of them; -1 when inactive.
  const current = trait.level - 1;

  return (
    <div className="w-72 max-w-full">
      <div className="flex items-center gap-2">
        <TraitHex trait={trait} size={24} />
        <div className="min-w-0">
          <p className="truncate text-[13px] leading-tight font-bold text-fg">{trait.name}</p>
          {detail?.kind ? (
            <p className="text-[11px] leading-tight text-faint">{TRAIT_KIND_LABELS[detail.kind]}</p>
          ) : null}
        </div>
      </div>
      {description ? (
        <p className={`mt-2 whitespace-pre-line ${detail?.description ? "text-muted" : "text-faint italic"}`}>
          {description}
        </p>
      ) : null}
      {described && detail ? (
        <ol aria-label="Breakpoints" className="mt-2 space-y-0.5">
          {detail.tiers.map((tier, i) => {
            const active = i === current;
            return (
              <li
                key={tier.min}
                aria-current={active ? "true" : undefined}
                // The ring and fill are on the row too, so the lit tier reads at a glance
                // even where its text wraps to a second line.
                className={`-mx-1 flex items-start gap-2 rounded px-1 py-0.5 ${active ? "bg-fg/[0.07] ring-1 ring-fg/25" : ""}`}
              >
                <span
                  className={`grid size-4.5 shrink-0 place-items-center rounded-full text-[10px] font-bold tabular-nums ${
                    active ? "bg-fg text-surface" : "text-faint ring-1 ring-line ring-inset"
                  }`}
                >
                  {tier.min}
                </span>
                <span className={`min-w-0 pt-px whitespace-pre-line ${active ? "font-semibold text-fg" : "text-muted"}`}>
                  {tier.text ?? "—"}
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="mt-1 text-muted">
          <TraitBreakpoints trait={trait} />
        </p>
      )}
      {detail?.members.length ? (
        <div className="mt-2 border-t border-line pt-2">
          <p className="mb-1 flex items-baseline justify-between gap-2 text-[10px] tracking-wider text-faint uppercase">
            <span>Champions</span>
            {onBoard ? <span className="tracking-normal normal-case">dimmed: not on this board</span> : null}
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

/** "1st", "2nd", "3rd" for an item priority; the bare number past that. */
export function ordinal(priority: number): string {
  return ORDINALS[priority] ?? String(priority);
}

/** Item priority chip pinned above an itemized unit: who gets the components first. */
export function PriorityChip({ priority, className = "" }: { priority: number; className?: string }) {
  return (
    <span
      role="img"
      aria-label={`Item priority ${ordinal(priority)}`}
      className={`rounded-sm bg-surface/90 px-1 text-[9px] leading-[1.3] font-bold text-carry ring-1 ring-carry/50 ${className}`}
    >
      {ordinal(priority)}
    </span>
  );
}
