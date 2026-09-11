import { Children, type ReactNode } from "react";
import type { TierRank } from "@/lib/static/game";

const TIER_BG: Record<TierRank, string> = {
  S: "bg-tier-s",
  A: "bg-tier-a",
  B: "bg-tier-b",
  C: "bg-tier-c",
};

export function TierBadge({ tier, className = "" }: { tier: TierRank; className?: string }) {
  return <span className={`grid place-items-center rounded font-bold text-surface ${TIER_BG[tier]} ${className}`}>{tier}</span>;
}

/** Tier label column plus a wrapping row of entries; a dash when the row is empty. */
export function TierRow({ tier, children }: { tier: TierRank; children?: ReactNode }) {
  return (
    <div className="flex gap-2.5 py-2">
      <TierBadge tier={tier} className="w-8 shrink-0 self-stretch text-sm" />
      <div className="flex min-h-11 min-w-0 flex-1 flex-wrap content-start items-start gap-1">
        {Children.count(children) > 0 ? children : <span className="self-center text-faint">—</span>}
      </div>
    </div>
  );
}

/** Corner dot on an icon whose entry has a note. */
export function NoteDot() {
  return (
    <span
      aria-hidden
      className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-panel bg-accent"
    />
  );
}
