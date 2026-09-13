import { CONTESTED_PICK_RATE, difficultyLevel, playstyleKind, type PlaystyleKind } from "@/lib/curated/comp-badges";
import { COMP_STYLE_LABELS, DIFFICULTY_LABELS, type CompStyle } from "@/lib/static/game";

/**
 * Comp metadata chips (architecture §9). Each says its meaning twice — a word and a
 * shape (chevrons or arrows, 1-3 rising bars, a flame) — so colour is reinforcement
 * and never the only channel, the rule the Gem badge set.
 */

const CHIP =
  "inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-px text-[10px] leading-4 font-medium whitespace-nowrap";

/** Fast 8 / Fast 9 / N-cost reroll / Flex. Neutral on purpose: the tier plate and stats already carry colour. */
export function PlaystyleBadge({ style, className = "" }: { style: CompStyle; className?: string }) {
  return (
    <span className={`${CHIP} border-line bg-raised text-fg ${className}`}>
      <PlaystyleGlyph kind={playstyleKind(style)} />
      {COMP_STYLE_LABELS[style]}
    </span>
  );
}

function PlaystyleGlyph({ kind }: { kind: PlaystyleKind }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 10 10"
      className="size-2.5 shrink-0 stroke-muted"
      fill="none"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {kind === "fast" ? (
        <path d="M2 5 5 2l3 3M2 8.5l3-3 3 3" />
      ) : kind === "reroll" ? (
        <path d="M8.3 3.8A3.4 3.4 0 0 0 2.2 3M1.7 6.2a3.4 3.4 0 0 0 6.1.8M2.2 1v2h2M7.8 9V7h-2" />
      ) : (
        <path d="M1.5 3.5h7M6.5 1.5l2 2-2 2M8.5 6.5h-7M3.5 4.5l-2 2 2 2" />
      )}
    </svg>
  );
}

const DIFFICULTY_TONE = {
  1: { chip: "border-diff-easy/40 bg-diff-easy/10 text-diff-easy", bar: "bg-diff-easy" },
  2: { chip: "border-diff-medium/40 bg-diff-medium/10 text-diff-medium", bar: "bg-diff-medium" },
  3: { chip: "border-diff-hard/40 bg-diff-hard/10 text-diff-hard", bar: "bg-diff-hard" },
} as const;

const BAR_HEIGHT = ["h-1", "h-1.5", "h-2"] as const;

/** Easy / Medium / Hard, with 1-3 rising bars filled. Renders nothing without a difficulty. */
export function DifficultyBadge({ difficulty, className = "" }: { difficulty: number | null; className?: string }) {
  const level = difficultyLevel(difficulty);
  if (level === null) return null;
  const tone = DIFFICULTY_TONE[level];
  return (
    <span className={`${CHIP} ${tone.chip} ${className}`}>
      <span aria-hidden className="flex h-2 items-end gap-px">
        {BAR_HEIGHT.map((height, i) => (
          <span key={height} className={`w-[3px] rounded-[1px] ${height} ${i < level ? tone.bar : "bg-line"}`} />
        ))}
      </span>
      {DIFFICULTY_LABELS[level]}
    </span>
  );
}

/** What a Contested badge means, for its tooltip and its accessible name alike. */
export const CONTESTED_TOOLTIP = `Picked on ${Math.round(CONTESTED_PICK_RATE * 100)}% or more of boards: expect other players to contest its units.`;

/** A comp so popular the lobby fights over its units. Pill-shaped like `GemBadge`, its opposite. */
export function ContestedBadge({ className = "", title }: { className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border border-contested/40 bg-contested/10 px-1.5 py-px text-[10px] font-semibold tracking-wide text-contested uppercase ${className}`}
    >
      <svg aria-hidden viewBox="0 0 10 12" className="h-2.5 w-2 fill-contested">
        <path d="M5 .5c.6 2.5 3.5 3.9 3.5 7.1a3.5 3.5 0 0 1-7 0c0-1.8 1.1-2.8 1.7-3.7.2 1.2.8 1.9 1.5 2.2C4.3 4.4 4.4 2.3 5 .5Z" />
      </svg>
      Contested
    </span>
  );
}
