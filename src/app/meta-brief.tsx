import { getMetaBrief } from "@/lib/curated/meta-brief";

/**
 * Patch context before you queue up (architecture §8). Cached from the repo's
 * `meta-notes.yaml`, so it prerenders into the static shell alongside `TopComps`
 * and sits outside the page's Suspense boundary.
 *
 * Spans the full grid row: the badge lists wrap, and a wide row keeps them on one
 * or two lines instead of a tall column next to the three glance panels.
 */
export async function MetaBrief() {
  const brief = await getMetaBrief();
  if (!brief) return null;

  return (
    <section className="rounded-md border border-line bg-panel p-3 md:col-span-3">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h2 className="text-[11px] tracking-wider text-faint uppercase">Meta brief</h2>
        <span className="min-w-0 truncate text-muted">{brief.title}</span>
        <span className="ml-auto shrink-0 text-faint tabular-nums">Patch {brief.patch}</span>
      </div>

      <div className="flex flex-col gap-1.5 sm:flex-row sm:gap-3">
        <BadgeList kind="buff" label="Buffed" entries={brief.buffs} />
        <BadgeList kind="nerf" label="Nerfed" entries={brief.nerfs} />
      </div>

      {brief.tip && (
        <p className="mt-2 border-t border-line pt-2 text-muted">
          <span className="text-faint">Tip · </span>
          {brief.tip}
        </p>
      )}
    </section>
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
