import type { CompStats } from "@/lib/curated/queries";

/**
 * Curated comp figures (architecture §7). Every one is **author-supplied** — this
 * site aggregates nothing globally (§0) — so a comp with none renders nothing at all
 * rather than a row of dashes pretending the data exists.
 *
 * Rates arrive as fractions and print as percentages, the same convention as the
 * rank record on `/`.
 */

function hasCompStats(stats: CompStats): boolean {
  return (
    stats.avgPlace !== null ||
    stats.top4Rate !== null ||
    stats.pickRate !== null ||
    stats.levelRecommended !== null
  );
}

const percent = (fraction: number) => `${(fraction * 100).toFixed(1)}%`;

export type CompStatField = "avg" | "top4" | "pick" | "level";

const ALL_FIELDS: CompStatField[] = ["avg", "top4", "pick", "level"];

/**
 * Compact label/value pairs. `fields` exists because the comp list's name column is
 * only wide enough for three before the fourth wraps onto a ragged second line, so it
 * shows the three rate stats and leaves the recommended level to the guide page.
 */
export function CompStatsRow({
  stats,
  fields = ALL_FIELDS,
  highlightField,
  className = "",
}: {
  stats: CompStats;
  fields?: readonly CompStatField[];
  highlightField?: CompStatField;
  className?: string;
}) {
  if (!hasCompStats(stats)) return null;

  const value: Record<CompStatField, string | null> = {
    avg: stats.avgPlace === null ? null : stats.avgPlace.toFixed(2),
    top4: stats.top4Rate === null ? null : percent(stats.top4Rate),
    pick: stats.pickRate === null ? null : percent(stats.pickRate),
    level: stats.levelRecommended === null ? null : String(stats.levelRecommended),
  };
  const label: Record<CompStatField, [string, string]> = {
    avg: ["Avg", "Average placement"],
    top4: ["Top 4", "Top-4 rate"],
    pick: ["Pick", "Pick rate"],
    level: ["Lv", "Recommended level"],
  };

  return (
    <dl className={`flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] ${className}`}>
      {fields.map((field) => (
        <Stat
          key={field}
          label={label[field][0]}
          value={value[field]}
          title={label[field][1]}
          highlighted={field === highlightField}
        />
      ))}
    </dl>
  );
}

function Stat({
  label,
  value,
  title,
  highlighted = false,
}: {
  label: string;
  value: string | null;
  title: string;
  highlighted?: boolean;
}) {
  if (value === null) return null;
  return (
    <div
      className={`flex items-baseline gap-1 rounded transition-colors ${
        highlighted ? "bg-accent/10 px-1 -mx-1 text-accent" : ""
      }`}
      title={title}
    >
      <dt className={highlighted ? "text-accent/70 font-semibold" : "text-faint"}>{label}</dt>
      <dd className={`tabular-nums ${highlighted ? "font-bold text-accent" : "font-medium text-muted"}`}>{value}</dd>
    </div>
  );
}
