import Image from "next/image";
import type { TraitCount } from "@/lib/curated/traits";
import type { TraitStyle } from "@/lib/static/game";

const STYLE_BG: Record<TraitStyle, string> = {
  bronze: "bg-trait-bronze",
  silver: "bg-trait-silver",
  gold: "bg-trait-gold",
  prismatic: "bg-trait-prismatic",
  unique: "bg-trait-unique",
};

const STYLE_TEXT: Record<TraitStyle, string> = {
  bronze: "text-trait-bronze",
  silver: "text-trait-silver",
  gold: "text-trait-gold",
  prismatic: "text-trait-prismatic",
  unique: "text-trait-unique",
};

/** Trait icon on a hexagon in its activation style (architecture §9); gray when inactive. */
export function TraitHex({ trait, size = 20 }: { trait: Pick<TraitCount, "name" | "iconUrl" | "style">; size?: number }) {
  const glyph = Math.round(size * 0.6);
  return (
    <span
      className={`hex grid shrink-0 place-items-center ${trait.style ? STYLE_BG[trait.style] : "bg-line"}`}
      style={{ width: size, height: Math.round(size * 1.155) }}
    >
      {trait.iconUrl ? (
        // CommunityDragon trait icons are white glyphs: black on a lit hex, dimmed on an unlit one.
        <Image
          src={trait.iconUrl}
          alt=""
          width={glyph}
          height={glyph}
          className={trait.style ? "brightness-0" : "opacity-60"}
        />
      ) : (
        <span className="text-[9px] font-bold text-surface">{trait.name.slice(0, 2)}</span>
      )}
    </span>
  );
}

/** A breakpoint's unit count as a small plate: filled in its style once reached, outlined before. */
export function TraitTierMin({ min, style, reached }: { min: number; style: TraitStyle; reached: boolean }) {
  return (
    <span
      className={`grid h-4 min-w-4 shrink-0 place-items-center rounded-sm px-0.5 text-[10px] font-bold tabular-nums ${
        reached ? `${STYLE_BG[style]} text-surface` : "text-faint ring-1 ring-line ring-inset"
      }`}
    >
      {min}
    </span>
  );
}

/** "3 › 5 › 7": the breakpoints, with those reached in the trait's style color. */
export function TraitBreakpoints({ trait }: { trait: Pick<TraitCount, "breakpoints" | "level" | "style"> }) {
  return (
    <span className="tabular-nums">
      {trait.breakpoints.map((min, i) => (
        <span key={min}>
          {i > 0 ? <span className="text-faint"> › </span> : null}
          <span className={i < trait.level && trait.style ? `font-semibold ${STYLE_TEXT[trait.style]}` : "text-faint"}>
            {min}
          </span>
        </span>
      ))}
    </span>
  );
}
