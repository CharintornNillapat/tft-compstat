import Link from "next/link";
import type { ReactNode } from "react";
import type { CompChampion, CompDetail } from "@/lib/curated/queries";
import { COMP_STYLE_LABELS, DIFFICULTY_LABELS } from "@/lib/static/game";
import { ChampionIcon } from "./champion-icon";
import { StarPips } from "./comp-details";
import { GuideMarkdown } from "./guide-markdown";
import { HexBoard } from "./hex-board";
import { ItemIcon } from "./item-icon";
import { PageHeader } from "./page-header";
import { TierBadge } from "./tier-row";
import { TraitBreakpoints, TraitHex } from "./trait-badge";

const updated = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

/** A comp's page body: board, traits, item builds, early and flex units, and the guide. */
export function CompGuide({ comp }: { comp: CompDetail }) {
  const difficulty = comp.difficulty ? DIFFICULTY_LABELS[comp.difficulty] : null;
  const itemHolders = comp.units.filter((unit) => unit.items.length > 0);

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <TierBadge tier={comp.tier} className="size-6 text-xs" />
            {comp.name}
          </span>
        }
        description={
          <>
            {COMP_STYLE_LABELS[comp.style]}
            {difficulty ? ` · ${difficulty}` : ""} · Patch {comp.patch}
            {comp.setName ? ` · ${comp.setName}` : ""} · Updated{" "}
            <time dateTime={comp.updatedAt}>{updated.format(new Date(comp.updatedAt))}</time>
          </>
        }
      >
        <Link href="/comps" className="text-muted hover:text-fg">
          ← All comps
        </Link>
      </PageHeader>
      {comp.summary ? <p className="mb-3 text-fg">{comp.summary}</p> : null}

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_15rem]">
        <Panel title="Board">
          <HexBoard units={comp.units} />
        </Panel>
        <Panel title="Traits">
          <TraitList traits={comp.traits} />
        </Panel>
      </div>

      {itemHolders.length ? (
        <Panel title="Item builds" className="mt-3">
          <ul className="divide-y divide-line">
            {itemHolders.map((unit) => (
              <li key={unit.apiName} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2 first:pt-0 last:pb-0">
                <div className="flex w-40 items-center gap-2">
                  <ChampionIcon name={unit.name} cost={unit.cost} iconUrl={unit.iconUrl} alt="" />
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

/** Every trait on the board with its count and breakpoints; inactive ones dimmed. */
function TraitList({ traits }: { traits: CompDetail["traits"] }) {
  return (
    <ul className="space-y-1.5">
      {traits.map((trait) => (
        <li key={trait.apiName} className={`flex items-center gap-2 ${trait.level > 0 ? "" : "opacity-50"}`}>
          <TraitHex trait={trait} size={22} />
          <span className="w-4 text-right font-semibold">{trait.count}</span>
          <span className="min-w-0 flex-1 truncate">{trait.name}</span>
          <span className="text-xs">
            <TraitBreakpoints trait={trait} />
          </span>
        </li>
      ))}
    </ul>
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
