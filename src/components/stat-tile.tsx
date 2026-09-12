import type { ReactNode } from "react";

const TONES = { default: "text-fg", good: "text-place-top4", bad: "text-tier-s" } as const;

/**
 * One headline number. Renders as a `<dt>`/`<dd>` pair, so a row of tiles is a
 * real `<dl>` rather than a pile of divs.
 */
export function StatTile({
  label,
  value,
  hint,
  tone = "default",
  className = "",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: keyof typeof TONES;
  className?: string;
}) {
  return (
    <div className={`rounded-md border border-line bg-panel px-3 py-2 ${className}`}>
      <dt className="text-[11px] tracking-wider text-faint uppercase">{label}</dt>
      <dd className={`mt-0.5 text-lg leading-tight font-semibold tabular-nums ${TONES[tone]}`}>{value}</dd>
      {hint ? <dd className="mt-0.5 text-[11px] text-faint">{hint}</dd> : null}
    </div>
  );
}
