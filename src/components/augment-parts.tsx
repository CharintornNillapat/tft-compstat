import type { Augment } from "@/lib/curated/augment-tiers";
import type { AugmentRarity } from "@/lib/static/game";
import { ItemIcon } from "./item-icon";
import { TIER_TEXT } from "./tier-row";

/**
 * Rarity as an outlined tint in the game's own silver / gold / prismatic, which are
 * the trait-style tokens for the same reason: the game uses one metal ladder for both
 * (architecture §9). A tint and a word, never a solid plate — the tier badge beside
 * it is the solid one, and the word carries the meaning without the colour.
 */
const RARITY_CLASSES: Record<AugmentRarity, string> = {
  Silver: "border-slate-400/50 bg-slate-400/10 text-slate-300 shadow-[0_0_8px_rgba(148,163,184,0.12)]",
  Gold: "border-amber-400/50 bg-amber-400/10 text-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.18)]",
  Prismatic: "border-purple-400/60 bg-gradient-to-r from-purple-500/15 via-fuchsia-500/15 to-indigo-500/15 text-purple-200 shadow-[0_0_12px_rgba(192,132,252,0.25)]",
};

export function RarityPill({ rarity, className = "" }: { rarity: AugmentRarity; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-px text-[10px] leading-4 font-semibold tracking-wide uppercase ${RARITY_CLASSES[rarity]} ${className}`}
    >
      <span
        aria-hidden="true"
        className={`size-1.5 rounded-full ${
          rarity === "Silver"
            ? "bg-slate-300 shadow-[0_0_4px_rgba(148,163,184,0.8)]"
            : rarity === "Gold"
            ? "bg-amber-300 shadow-[0_0_4px_rgba(251,191,36,0.8)]"
            : "bg-purple-300 shadow-[0_0_4px_rgba(192,132,252,0.9)]"
        }`}
      />
      {rarity}
    </span>
  );
}

/** Icon, name and rarity: the card face shared by `/augments` and a comp's best augments. */
export function AugmentFace({ augment, size = 32 }: { augment: Augment; size?: number }) {
  return (
    <>
      <ItemIcon name={augment.name} iconUrl={augment.iconUrl} size={size} alt="" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-fg">{augment.name}</span>
        <RarityPill rarity={augment.rarity} />
      </span>
    </>
  );
}

export const MISSING_AUGMENT_TEXT = "No description synced for this augment.";

/** Tooltip body: name, rarity and tier, then what the augment does. */
export function AugmentDetails({ augment }: { augment: Augment }) {
  return (
    <div className="w-64 max-w-full">
      <p className="font-bold text-fg">{augment.name}</p>
      <p className="mt-0.5 flex items-center gap-1.5">
        <RarityPill rarity={augment.rarity} />
        <span className={`font-semibold ${TIER_TEXT[augment.tier]}`}>{augment.tier} tier</span>
      </p>
      <p className={`mt-1.5 whitespace-pre-line ${augment.description ? "text-muted" : "text-faint italic"}`}>
        {augment.description ?? MISSING_AUGMENT_TEXT}
      </p>
    </div>
  );
}
