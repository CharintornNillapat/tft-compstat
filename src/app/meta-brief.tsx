import Image from "next/image";
import { ChampionIcon } from "@/components/champion-icon";
import { ItemIcon } from "@/components/item-icon";
import { getMetaBrief, type BriefEntry } from "@/lib/curated/meta-brief";
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

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3">
        <BadgeList kind="buff" label="Buffed" entries={brief.buffs} />
        <BadgeList kind="nerf" label="Nerfed" entries={brief.nerfs} />
        <BadgeList kind="adjust" label="Adjusted" entries={brief.adjustments} />
      </div>
    </OverviewPanel>
  );
}

/**
 * The arrow/diamond glyph is not decoration: colour alone would leave the lists
 * indistinguishable under a colour-vision deficiency, the same reason
 * `PlacementPill` always prints its digit (architecture §9).
 */
const KINDS = {
  buff: { glyph: "▲", badge: "border-buff/40 bg-buff/10 text-buff", heading: "text-buff" },
  nerf: { glyph: "▼", badge: "border-nerf/40 bg-nerf/10 text-nerf", heading: "text-nerf" },
  adjust: { glyph: "◆", badge: "border-adjust/40 bg-adjust/10 text-adjust", heading: "text-adjust" },
} as const;

function BadgeList({
  kind,
  label,
  entries,
}: {
  kind: keyof typeof KINDS;
  label: string;
  entries: BriefEntry[];
}) {
  if (entries.length === 0) return null;
  const { glyph, badge, heading } = KINDS[kind];

  return (
    <div className="min-w-0 flex-1">
      <h3 className={`mb-1 text-[10px] font-semibold tracking-wider uppercase ${heading}`}>{label}</h3>
      <ul className="flex flex-wrap gap-1">
        {entries.map((entry) => (
          <li
            key={entry.text}
            className={`flex max-w-full items-center gap-1.5 rounded border px-1.5 py-0.5 text-[12px] ${badge}`}
          >
            <span aria-hidden className="text-[9px] leading-none shrink-0">
              {glyph}
            </span>
            {entry.entity?.kind === "champion" ? (
              <span className="-my-0.5 shrink-0" aria-hidden>
                <ChampionIcon
                  name={entry.entity.name}
                  cost={entry.entity.cost}
                  iconUrl={entry.entity.iconUrl}
                  size={16}
                  alt=""
                />
              </span>
            ) : entry.entity?.kind === "item" ? (
              <span className="-my-0.5 shrink-0" aria-hidden>
                <ItemIcon
                  name={entry.entity.name}
                  iconUrl={entry.entity.iconUrl}
                  size={16}
                  alt=""
                />
              </span>
            ) : entry.entity?.kind === "trait" && entry.entity.iconUrl ? (
              <span className="-my-0.5 shrink-0" aria-hidden>
                <Image
                  src={entry.entity.iconUrl}
                  alt=""
                  width={16}
                  height={16}
                  className="size-4 object-contain brightness-125"
                />
              </span>
            ) : null}
            <span className="min-w-0 truncate">{entry.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
