import { openersFileSchema } from "./schemas";
import { parseYaml } from "./validate";

/**
 * Split out of `openers.ts` so it has no dependency on `next/cache` or the
 * Supabase clients that module's other exports pull in — this needs to be
 * importable from a plain Node script (`sync-meta.ts`), not just from a
 * Next.js render.
 *
 * Every `transition_to` slug a file names, best-effort and without checking
 * them against anything: used by `sync:meta` to warn when a generated comp it
 * is about to remove is still a pivot target, before that comp disappears and
 * `getOpeners()` quietly drops the pill (architecture §7.2, §8). Never throws:
 * a file too broken to read this much out of is already going to fail
 * `getOpeners()` on its own terms.
 */
export function extractOpenerPivotSlugs(file: string, text: string): string[] {
  const data = parseYaml(file, text).data;
  const parsed = openersFileSchema.safeParse(data);
  const openersList = parsed.success
    ? parsed.data.openers
    : Array.isArray((data as { openers?: unknown })?.openers)
      ? (data as { openers: unknown[] }).openers
      : [];
  const slugs = new Set<string>();
  for (const opener of openersList) {
    const transitionTo = (opener as { transition_to?: unknown })?.transition_to;
    if (!Array.isArray(transitionTo)) continue;
    for (const slug of transitionTo) if (typeof slug === "string") slugs.add(slug);
  }
  return [...slugs];
}
