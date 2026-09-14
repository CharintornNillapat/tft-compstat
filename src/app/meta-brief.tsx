import { getMetaBrief } from "@/lib/curated/meta-brief";
import { OverviewPanel } from "./overview-panel";

/**
 * Patch context before you queue up (architecture §8). Cached from the repo's
 * `meta-notes.yaml`, so it prerenders into the static shell alongside `TopComps`
 * and sits outside the page's Suspense boundary.
 *
 * Spans the full grid row: the badge lists wrap, and a wide row keeps them on one
 * or two lines. The tip comes first because it is the one line you can act on.
 */
export async function MetaBrief() {
  const brief = await getMetaBrief();
  if (!brief) return null;

  return (
    <OverviewPanel title="Meta brief" subtitle={brief.title} className="md:col-span-2">
      {brief.tip && (
        <p className="mb-2.5 rounded border border-accent/25 bg-accent/5 px-2 py-1.5">
          <span className="font-semibold text-accent">Tip · </span>
          {brief.tip}
        </p>
      )}

      <div className="flex flex-col gap-1.5 sm:flex-row sm:gap-3">
        <BadgeList kind="buff" label="Buffed" entries={brief.buffs} />
        <BadgeList kind="nerf" label="Nerfed" entries={brief.nerfs} />
      </div>
    </OverviewPanel>
  );
}

/**
 * The arrow is not decoration: colour alone would leave the two lists
 * indistinguishable under a colour-vision deficiency, the same reason
 * `PlacementPill` always prints its digit (architecture §9).
 */
const KINDS = {
  buff: { glyph: "▲", badge: "border-buff/40 bg-buff/10 text-buff", heading: "text-buff" },
  nerf: { glyph: "▼", badge: "border-nerf/40 bg-nerf/10 text-nerf", heading: "text-nerf" },
} as const;

function BadgeList({
  kind,
  label,
  entries,
}: {
  kind: keyof typeof KINDS;
  label: string;
  entries: string[];
}) {
  if (entries.length === 0) return null;
  const { glyph, badge, heading } = KINDS[kind];

  return (
    <div className="min-w-0 flex-1">
      <h3 className={`mb-1 text-[10px] font-semibold tracking-wider uppercase ${heading}`}>{label}</h3>
      <ul className="flex flex-wrap gap-1">
        {entries.map((entry) => (
          <li
            key={entry}
            className={`flex max-w-full items-center gap-1 rounded border px-1.5 py-0.5 text-[12px] ${badge}`}
          >
            <span aria-hidden className="text-[9px] leading-none">
              {glyph}
            </span>
            <span className="min-w-0 truncate">{entry}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
