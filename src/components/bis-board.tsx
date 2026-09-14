"use client";

import { Fragment, useMemo, useState } from "react";
import type { BisChampion, BisItem } from "@/lib/curated/bis";
import type { ItemText } from "@/lib/static/tooltip-text";
import { BIS_ROLES, isChampionCost, type BisRole, type ChampionCost } from "@/lib/static/game";
import { ChampionIcon } from "./champion-icon";
import { CostFilter } from "./cost-filter";
import { COST_TEXT } from "./cost-styles";
import { EmptyState } from "./empty-state";
import { HoverTip, useHoverTip } from "./hover-tip";
import { ItemIcon } from "./item-icon";
import { ToggleGroup } from "./toggle-group";
import { ItemTextBlock } from "./tooltip-text";

const ROLE_OPTIONS = BIS_ROLES.map((role) => ({ value: role, label: role }));

/**
 * Champion item builds, filterable by cost and role (architecture §9).
 *
 * One row per champion rather than a card grid: the question this page answers is
 * "what do I put on this unit", which is a lookup, and a lookup wants every row in
 * the same columns so the eye can run down them. The board is a client component
 * only for the two filters and the shared tooltip — the data is prerendered.
 */
export function BisBoard({
  champions,
  itemText,
}: {
  champions: BisChampion[];
  /** Tooltip text by item api name, sent once rather than on every build that holds the item. */
  itemText: Readonly<Record<string, ItemText>>;
}) {
  const [costs, setCosts] = useState<ReadonlySet<ChampionCost>>(() => new Set());
  const [roles, setRoles] = useState<ReadonlySet<BisRole>>(() => new Set());
  const tip = useHoverTip<BisItem>();

  const visible = useMemo(
    () =>
      champions.filter(
        (champion) =>
          (costs.size === 0 || (isChampionCost(champion.cost) && costs.has(champion.cost))) &&
          (roles.size === 0 || roles.has(champion.role)),
      ),
    [champions, costs, roles],
  );

  return (
    <section aria-label="Champion item builds">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <CostFilter selected={costs} onChange={setCosts} />
        <ToggleGroup label="Role" options={ROLE_OPTIONS} selected={roles} onChange={setRoles} />
        <p className="text-muted" aria-live="polite">
          {visible.length} {visible.length === 1 ? "champion" : "champions"}
        </p>
      </div>

      {visible.length === 0 ? (
        <EmptyState title="No champion matches those filters">Clear a filter to see more builds.</EmptyState>
      ) : (
        <ul className="divide-y divide-line rounded-md border border-line bg-panel">
          {visible.map((champion) => (
            <BisRow key={champion.apiName} champion={champion} tip={tip} />
          ))}
        </ul>
      )}

      {tip.active ? (
        <HoverTip id={tip.id} anchor={tip.active.anchor} wide={tip.active.item.apiName in itemText}>
          <ItemDetails item={tip.active.item} text={itemText[tip.active.item.apiName] ?? null} />
        </HoverTip>
      ) : null}
    </section>
  );
}

type Tip = ReturnType<typeof useHoverTip<BisItem>>;

/**
 * Stacks at 400px and becomes three columns once there is room. `md` rather than
 * `sm`: the two item groups plus the champion need about 600px before the columns
 * stop squeezing the build into two lines.
 */
function BisRow({ champion, tip }: { champion: BisChampion; tip: Tip }) {
  return (
    <li className="flex flex-col gap-2 p-2 md:flex-row md:items-center md:gap-3">
      <div className="flex min-w-0 items-center gap-2 md:w-44 md:shrink-0 lg:w-52">
        <ChampionIcon name={champion.name} cost={champion.cost} iconUrl={champion.iconUrl} size={36} alt="" />
        <div className="min-w-0">
          <p className="flex items-baseline gap-1.5">
            <span className="min-w-0 truncate font-semibold">{champion.name}</span>
            <span className={`shrink-0 text-[11px] tabular-nums ${COST_TEXT[champion.cost] ?? "text-faint"}`}>
              {champion.cost}
            </span>
          </p>
          <p className="truncate text-[11px] text-faint">{champion.role}</p>
        </div>
      </div>

      <ItemGroup label="Best in slot" items={champion.primary} tip={tip} primary />
      <ItemGroup label="Flex" items={champion.secondary} tip={tip} />
      <ItemGroup label="Artifact / Radiant" items={champion.special} tip={tip} wideLabel />

      <div className="min-w-0 md:w-40 md:shrink-0 md:text-right">
        {champion.avgPlace !== null ? (
          <p className="text-muted tabular-nums">
            avg {champion.avgPlace.toFixed(2)}
            {champion.games !== null ? (
              <span className="text-faint"> · {champion.games.toLocaleString("en-US")}</span>
            ) : null}
          </p>
        ) : null}
        {champion.notes ? <p className="text-[11px] text-faint">{champion.notes}</p> : null}
      </div>
    </li>
  );
}

/**
 * The BIS build sits on a gold-tinted plate and the flex items sit on nothing, so
 * the two groups separate at a glance without a divider between them. Gold is
 * `--color-accent`, the site's own accent, and it is safe here in a way it was not
 * on a champion portrait (architecture §9): item icons carry no cost ramp for it to
 * be confused with.
 *
 * Three things carry the distinction, not just the colour — the plate, the larger
 * icons, and the "BIS" / "Flex" label — because a reader with a colour-vision
 * deficiency should not have to tell gold from nothing to read the page.
 *
 * An empty group keeps its slot with a dash, so the columns still line up down the page.
 * The BIS plate never grows or shrinks: every build is three items, so a fixed plate keeps
 * the Flex and Artifact / Radiant columns aligned, and with three groups sharing the row a
 * flexible plate was squeezed until its third item wrapped at 960px.
 */
function ItemGroup({
  label,
  items,
  tip,
  primary = false,
  wideLabel = false,
}: {
  label: string;
  items: BisItem[];
  tip: Tip;
  primary?: boolean;
  /** For a label too long for the 2rem column, like "Artifact / Radiant". */
  wideLabel?: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 items-center gap-1.5 rounded ${
        primary ? "border border-accent/25 bg-accent/5 px-1.5 py-1 md:flex-none" : "px-1.5 py-1 md:flex-1"
      }`}
    >
      <span
        className={`${wideLabel ? "w-14" : "w-8"} shrink-0 text-[9px] leading-tight tracking-wider uppercase ${
          primary ? "font-semibold text-accent" : "text-faint"
        }`}
      >
        {primary ? "BIS" : label}
      </span>
      {items.length === 0 ? (
        <span className="text-faint" title="No artifact or radiant reached the sync's games floor">
          —
        </span>
      ) : null}
      <ul className="flex min-w-0 flex-wrap items-center gap-1">
        {items.map((item, index) => (
          <li key={`${item.apiName}-${index}`} className="flex">
            <button type="button" {...tip.triggerProps(item)} className="rounded-md p-0.5 hover:bg-raised">
              <ItemIcon name={item.name} iconUrl={item.iconUrl} size={primary ? 34 : 26} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const KIND_TAG: Partial<Record<string, string>> = { artifact: "Artifact", radiant: "Radiant" };

/** Name, emblem trait, recipe, stats and description — the same tooltip body `/tiers/items` shows — plus the artifact/radiant tag. */
function ItemDetails({ item, text }: { item: BisItem; text: ItemText | null }) {
  const tag = item.kind ? KIND_TAG[item.kind] : undefined;
  return (
    <>
      <p className="font-semibold text-fg">{item.name}</p>
      {tag ? <p className="text-muted">{tag}</p> : null}
      {item.grantsTrait ? <p className="text-muted">Grants {item.grantsTrait}</p> : null}
      {item.components.length ? (
        <p className="mt-1 flex flex-wrap items-center gap-1 text-muted">
          {item.components.map((component, i) => (
            <Fragment key={i}>
              {i > 0 ? <span aria-hidden>+</span> : null}
              <ItemIcon name={component.name} iconUrl={component.iconUrl} size={16} alt="" />
              <span>{component.name}</span>
            </Fragment>
          ))}
        </p>
      ) : null}
      {text ? <ItemTextBlock text={text} /> : null}
    </>
  );
}
