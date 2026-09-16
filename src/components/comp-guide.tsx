import Link from "next/link";
import type { ReactNode } from "react";
import type { CompAugments } from "@/lib/curated/augment-tiers";
import type { CompChampion, CompDetail } from "@/lib/curated/queries";
import { isContested } from "@/lib/curated/comp-badges";
import { teamCodeHint } from "@/lib/curated/team-code";
import { CompAugmentsList } from "./comp-augments";
import { ChampionIcon } from "./champion-icon";
import { CONTESTED_TOOLTIP, ContestedBadge, DifficultyBadge, PlaystyleBadge } from "./comp-badges";
import { GEM_TOOLTIP, GemBadge } from "./comp-details";
import { CompItemBuilds } from "./comp-item-builds";
import { CompStatsRow } from "./comp-stats";
import { CompTraitList } from "./comp-traits";
import { CopyTeamCodeButton } from "./copy-team-code-button";
import { GuideTimeline } from "./guide-timeline";
import { HexBoard } from "./hex-board";
import { PageHeader } from "./page-header";
import { TierBadge } from "./tier-row";

const updated = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

/**
 * A comp's page body (architecture §9): board and traits, then two columns from `md` —
 * item builds, best augments and the early/flex transition on the left, the guide as a
 * stage timeline on the right. Either column takes the full width when the other has
 * nothing to show. `augments` is null for a comp MetaTFT matched no guide to.
 */
export function CompGuide({ comp, augments = null }: { comp: CompDetail; augments?: CompAugments | null }) {
  // `comp.units` already arrives carries-then-priority-then-cost from the query, so
  // "1st" leads this list without a second sort here.
  const itemHolders = comp.units.filter((unit) => unit.items.length > 0);
  const hasAugments = Boolean(augments?.augments.length);
  const hasTransition = comp.earlyUnits.length > 0 || comp.flexUnits.length > 0;
  const hasBuilds = itemHolders.length > 0 || hasAugments || hasTransition;

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
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          {comp.teamCode ? <CopyTeamCodeButton code={comp.teamCode.code} hint={teamCodeHint(comp.teamCode)} /> : null}
          <Link href="/comps" className="text-muted hover:text-fg">
            ← All comps
          </Link>
        </div>
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

      {/* `md`, not `lg`: the half-width 1080p window (~960px) this site is built for
          should get both columns. `items-start` so a short column does not stretch. */}
      <div className="mt-3 grid grid-cols-1 items-start gap-3 md:grid-cols-12">
        {hasBuilds ? (
          <div className={`flex min-w-0 flex-col gap-3 ${comp.guide ? "md:col-span-7" : "md:col-span-12"}`}>
            {itemHolders.length ? (
              <Panel title="Item builds">
                <CompItemBuilds units={itemHolders} />
              </Panel>
            ) : null}

            {augments && hasAugments ? (
              <Panel title="Best augments">
                <CompAugmentsList augments={augments.augments} />
                <p className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[11px] text-faint">
                  <span>
                    {augments.source ? <>Graded for this comp by the MetaTFT guide “{augments.source}”</> : "Graded for this comp by MetaTFT"}
                    , by rarity, best first within each.
                    {/* Picks are balanced across rarities (§7.5), so one rarity means the guide grades no other. */}
                    {new Set(augments.augments.map((augment) => augment.rarity)).size === 1 ? (
                      <> This guide grades {augments.augments[0]!.rarity} augments only.</>
                    ) : null}
                  </span>
                  <Link href="/augments" className="text-muted hover:text-fg">
                    All augments →
                  </Link>
                </p>
              </Panel>
            ) : null}

            {hasTransition ? <TransitionPanel early={comp.earlyUnits} flex={comp.flexUnits} /> : null}
          </div>
        ) : null}

        {comp.guide ? (
          <Panel title="Strategy guide" className={hasBuilds ? "md:col-span-5" : "md:col-span-12"}>
            {/* The generated guide's Items block repeats the item builds word for word. */}
            <GuideTimeline markdown={comp.guide} omit={itemHolders.length ? ["Items"] : []} />
          </Panel>
        ) : null}
      </div>
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

/**
 * The opener that holds the carry items, beside the swaps for a contested unit: one
 * card, since each half is only a few portraits. Side by side from `sm`, split by a
 * rule; one half alone takes the whole card.
 */
function TransitionPanel({ early, flex }: { early: CompChampion[]; flex: CompChampion[] }) {
  const halves = [
    { title: "Early item holders", hint: "Opener that holds the carry items", champions: early },
    { title: "Flex swaps", hint: "Replacements when a unit is contested", champions: flex },
  ].filter((half) => half.champions.length > 0);

  return (
    <Panel title="Transition">
      <div className={`grid gap-3 ${halves.length > 1 ? "sm:grid-cols-2 sm:gap-0" : ""}`}>
        {halves.map((half, i) => (
          <div
            key={half.title}
            className={`min-w-0 ${i > 0 ? "border-t border-line pt-3 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-3" : "sm:pr-3"}`}
          >
            <h3 className="font-medium text-fg">{half.title}</h3>
            <p className="mb-1.5 text-[11px] text-faint">{half.hint}</p>
            <ChampionRow champions={half.champions} />
          </div>
        ))}
      </div>
    </Panel>
  );
}

function ChampionRow({ champions }: { champions: CompChampion[] }) {
  return (
    <ul className="flex flex-wrap gap-1">
      {champions.map((champion) => (
        // w-14, not w-12: "Scuttlecrab" and "Mama Beak" truncated at 48px.
        <li key={champion.apiName} className="flex w-14 flex-col items-center gap-0.5" title={champion.traits.join(" · ")}>
          <ChampionIcon name={champion.name} cost={champion.cost} iconUrl={champion.iconUrl} alt="" />
          <span className="w-full truncate text-center text-[10px] leading-tight text-muted">{champion.name}</span>
        </li>
      ))}
    </ul>
  );
}
