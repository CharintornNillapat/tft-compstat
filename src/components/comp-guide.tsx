import Link from "next/link";
import type { ReactNode } from "react";
import type { CompAugments } from "@/lib/curated/augment-tiers";
import type { CompChampion, CompDetail } from "@/lib/curated/queries";
import { isContested } from "@/lib/curated/comp-badges";
import { AugmentFace } from "./augment-parts";
import { ChampionIcon } from "./champion-icon";
import { CONTESTED_TOOLTIP, ContestedBadge, DifficultyBadge, PlaystyleBadge } from "./comp-badges";
import { GEM_TOOLTIP, GemBadge, PriorityChip, StarPips } from "./comp-details";
import { CompStatsRow } from "./comp-stats";
import { CompTraitList } from "./comp-traits";
import { GuideMarkdown } from "./guide-markdown";
import { HexBoard } from "./hex-board";
import { ItemIcon } from "./item-icon";
import { PageHeader } from "./page-header";
import { TierBadge } from "./tier-row";

const updated = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

/**
 * A comp's page body: board, traits, item builds, best augments, early and flex units,
 * and the guide. `augments` is null for a comp MetaTFT matched no guide to.
 */
export function CompGuide({ comp, augments = null }: { comp: CompDetail; augments?: CompAugments | null }) {
  // `comp.units` already arrives carries-then-priority-then-cost from the query, so
  // "1st" leads this list without a second sort here.
  const itemHolders = comp.units.filter((unit) => unit.items.length > 0);

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            <TierBadge tier={comp.tier} className="size-6 text-xs" />
            {comp.name}
            {/* Plain titles here, not the list's tooltip: the header has no shared
                HoverTip instance, and two badges do not earn a client component. */}
            {isContested(comp.pickRate) ? <ContestedBadge title={CONTESTED_TOOLTIP} /> : null}
            {comp.isGem ? <GemBadge title={GEM_TOOLTIP} /> : null}
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <PlaystyleBadge style={comp.style} />
            <DifficultyBadge difficulty={comp.difficulty} />
            <span>
              Patch {comp.patch}
              {comp.setName ? ` · ${comp.setName}` : ""} · Updated{" "}
              <time dateTime={comp.updatedAt}>{updated.format(new Date(comp.updatedAt))}</time>
            </span>
          </span>
        }
      >
        <Link href="/comps" className="text-muted hover:text-fg">
          ← All comps
        </Link>
      </PageHeader>
      {comp.summary ? <p className="mb-2 text-fg">{comp.summary}</p> : null}
      <CompStatsRow stats={comp} className="mb-3 text-xs" />

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_15rem]">
        <Panel title="Board">
          <HexBoard units={comp.units} />
        </Panel>
        <Panel title="Traits">
          <CompTraitList
            traits={comp.traits}
            details={comp.traitDetails}
            board={comp.units.map((unit) => unit.name)}
          />
        </Panel>
      </div>

      {itemHolders.length ? (
        <Panel title="Item builds" className="mt-3">
          <ul className="divide-y divide-line">
            {itemHolders.map((unit) => (
              <li key={unit.apiName} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2 first:pt-0 last:pb-0">
                <div className="flex w-40 items-center gap-2">
                  <span className="relative shrink-0">
                    <ChampionIcon name={unit.name} cost={unit.cost} iconUrl={unit.iconUrl} alt="" />
                    {unit.carryPriority ? (
                      <PriorityChip priority={unit.carryPriority} className="absolute -top-1 -left-1" />
                    ) : null}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{unit.name}</p>
                    <p className="flex items-center gap-1.5 text-xs text-muted">
                      <StarPips star={unit.star} />
                      {unit.isCarry ? <span className="text-accent">Carry</span> : null}
                    </p>
                  </div>
                </div>
                <ul className="flex flex-wrap gap-x-3 gap-y-1.5">
                  {unit.items.map((item, i) => (
                    <li key={i} className="flex items-center gap-1.5">
                      <ItemIcon name={item.name} iconUrl={item.iconUrl} size={28} alt="" />
                      <span className="text-muted">{item.name}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {augments?.augments.length ? (
        <Panel title="Best augments" className="mt-3">
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(12.5rem,1fr))] gap-1.5">
            {augments.augments.map((augment) => (
              // A native title rather than the shared tooltip: this page has no HoverTip
              // instance, and six descriptions do not earn a client island.
              <li
                key={augment.apiName}
                title={augment.description ?? undefined}
                className="flex min-w-0 items-center gap-2 rounded-md border border-line bg-raised/40 p-1.5"
              >
                <AugmentFace augment={augment} />
              </li>
            ))}
          </ul>
          <p className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[11px] text-faint">
            <span>
              {augments.source ? <>Graded for this comp by the MetaTFT guide “{augments.source}”</> : "Graded for this comp by MetaTFT"}
              , best first.
            </span>
            <Link href="/augments" className="text-muted hover:text-fg">
              All augments →
            </Link>
          </p>
        </Panel>
      ) : null}

      {comp.earlyUnits.length || comp.flexUnits.length ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {comp.earlyUnits.length ? (
            <Panel title="Early game">
              <ChampionRow champions={comp.earlyUnits} />
            </Panel>
          ) : null}
          {comp.flexUnits.length ? (
            <Panel title="Flex units">
              <ChampionRow champions={comp.flexUnits} />
            </Panel>
          ) : null}
        </div>
      ) : null}

      {comp.guide ? (
        <Panel title="Guide" className="mt-3">
          <GuideMarkdown markdown={comp.guide} />
        </Panel>
      ) : null}
    </>
  );
}

function Panel({ title, className = "", children }: { title: string; className?: string; children: ReactNode }) {
  return (
    <section className={`min-w-0 rounded-md border border-line bg-panel p-3 ${className}`}>
      <h2 className="mb-2 text-[11px] font-medium tracking-wider text-faint uppercase">{title}</h2>
      {children}
    </section>
  );
}

function ChampionRow({ champions }: { champions: CompChampion[] }) {
  return (
    <ul className="flex flex-wrap gap-1">
      {champions.map((champion) => (
        <li key={champion.apiName} className="flex w-12 flex-col items-center gap-0.5" title={champion.traits.join(" · ")}>
          <ChampionIcon name={champion.name} cost={champion.cost} iconUrl={champion.iconUrl} alt="" />
          <span className="w-full truncate text-center text-[10px] leading-tight text-muted">{champion.name}</span>
        </li>
      ))}
    </ul>
  );
}
