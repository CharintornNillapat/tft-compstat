/**
 * Ability and item text as the tooltips receive it (architecture §4.8, §9). Plain
 * types plus one label, with no zod, so client components can import it.
 */

export type ChampionAbility = {
  name: string;
  text: string;
  /** `text_source`: where the values came from, e.g. "pbe". */
  source: string | null;
};

export type ItemText = {
  description: string | null;
  stats: string | null;
  source: string | null;
};

/**
 * The note under tooltip text. MetaTFT's lookup is a PBE build, which can lead live
 * by a patch, so the tooltip says so rather than presenting its numbers as live.
 */
export function textSourceLabel(source: string | null): string | null {
  if (!source) return null;
  return source.toLowerCase() === "pbe" ? "Values from PBE data" : `Values from patch ${source}`;
}

/** Only the fields a tooltip reads; null when there is nothing to show. */
export function toItemText(row: { description: string | null; stats: string | null; text_source: string | null }): ItemText | null {
  return row.description || row.stats ? { description: row.description, stats: row.stats, source: row.text_source } : null;
}
