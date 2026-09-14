"use client";

import { buildTeamCode, teamCodeHint } from "@/lib/curated/team-code";
import { computeActiveTraits, isActive, type TraitInfo } from "@/lib/curated/traits";
import { plannerOrder, toPlannerUnits, toTraitUnits, type PlannerCatalog } from "@/lib/planner/board";
import { isLoadable, type SavedComp } from "@/lib/planner/saved-comps";
import { ChampionIcon } from "../champion-icon";
import { CopyTeamCodeButton } from "../copy-team-code-button";
import { EmptyState } from "../empty-state";
import { TOGGLE_BUTTON, TOGGLE_OFF } from "../toggle-group";
import { TraitHex } from "../trait-badge";
import { ConfirmButton } from "./confirm-button";

const updated = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

/** "My Planner": saved comps, pinned first, each with load, duplicate, delete and its team code. */
export function SavedCompList({
  comps,
  issues,
  ready,
  catalog,
  traits,
  mutator,
  editingId,
  dirty,
  onLoad,
  onDuplicate,
  onDelete,
  onFavorite,
}: {
  comps: readonly SavedComp[];
  issues: readonly string[];
  /** False until the browser's storage has been read. */
  ready: boolean;
  catalog: PlannerCatalog;
  traits: ReadonlyMap<string, TraitInfo>;
  mutator: string;
  editingId: string | null;
  /** The editor holds unsaved changes, so loading over it asks first. */
  dirty: boolean;
  onLoad: (comp: SavedComp) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onFavorite: (id: string) => void;
}) {
  if (!ready) return <p className="py-6 text-center text-muted">Loading saved comps…</p>;

  return (
    <section aria-label="Saved comps">
      {issues.length ? (
        <details className="mb-2 rounded-md border border-line bg-panel px-3 py-2 text-xs text-muted">
          <summary className="cursor-pointer">Some saved data needed fixing ({issues.length})</summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {issues.map((issue, index) => (
              <li key={index}>{issue}</li>
            ))}
          </ul>
        </details>
      ) : null}
      {comps.length === 0 ? (
        <EmptyState title="No saved comps yet">Build a board in the Builder and press Save.</EmptyState>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2">
          {comps.map((comp) => {
            const loadable = isLoadable(comp, mutator);
            const code = loadable ? buildTeamCode(toPlannerUnits(comp.units, catalog), comp.set) : null;
            const active = loadable
              ? computeActiveTraits(toTraitUnits(comp.units, catalog), traits).filter(isActive).slice(0, 6)
              : [];
            const isEditing = comp.id === editingId;
            return (
              <li key={comp.id} className="min-w-0 rounded-md border border-line bg-panel p-3">
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    aria-pressed={comp.isFavorite}
                    aria-label={comp.isFavorite ? `Unpin ${comp.name}` : `Pin ${comp.name} to the top`}
                    title={comp.isFavorite ? "Unpin" : "Pin to the top"}
                    onClick={() => onFavorite(comp.id)}
                    className={`-mt-1 -ml-1 grid size-8 shrink-0 place-items-center rounded text-base hover:bg-raised ${
                      comp.isFavorite ? "text-gem" : "text-faint hover:text-fg"
                    }`}
                  >
                    {comp.isFavorite ? "★" : "☆"}
                  </button>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-medium">{comp.name}</h3>
                    <p className="text-xs text-muted">
                      {comp.units.length} {comp.units.length === 1 ? "unit" : "units"} · updated{" "}
                      <time dateTime={comp.updatedAt}>{updated.format(new Date(comp.updatedAt))}</time>
                      {isEditing ? " · in the builder" : ""}
                    </p>
                    {loadable ? null : (
                      <p className="text-xs text-nerf">Saved for {comp.set}; it can&apos;t be loaded into this set.</p>
                    )}
                  </div>
                </div>
                {loadable && comp.units.length ? (
                  <ul className="mt-2 flex flex-wrap gap-1" aria-label="Units">
                    {plannerOrder(comp.units, catalog).map((unit) => {
                      const champion = catalog.champions[unit.apiName];
                      return (
                        <li key={unit.apiName} title={champion?.name}>
                          <ChampionIcon
                            name={champion?.name ?? unit.apiName}
                            cost={champion?.cost ?? 0}
                            iconUrl={champion?.iconUrl ?? null}
                            size={28}
                          />
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
                {active.length ? (
                  <ul className="mt-2 flex flex-wrap gap-x-2.5 gap-y-1 text-xs" aria-label="Active traits">
                    {active.map((trait) => (
                      <li key={trait.apiName} className="flex items-center gap-1">
                        <TraitHex trait={trait} size={18} />
                        <span className="font-semibold tabular-nums">{trait.count}</span>
                        <span className="text-muted">{trait.name}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <ConfirmButton
                    label="Load"
                    confirmLabel="Replace board?"
                    title="Open in the builder"
                    needsConfirm={dirty}
                    disabled={!loadable}
                    onConfirm={() => onLoad(comp)}
                  />
                  <button type="button" onClick={() => onDuplicate(comp.id)} className={`${TOGGLE_BUTTON} ${TOGGLE_OFF}`}>
                    Duplicate
                  </button>
                  <ConfirmButton label="Delete" confirmLabel="Confirm delete" onConfirm={() => onDelete(comp.id)} />
                  {code ? <CopyTeamCodeButton code={code.code} hint={teamCodeHint(code)} /> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-xs text-faint">
        Saved comps live in this browser only: they don&apos;t follow you to another device, and clearing site data removes
        them.
      </p>
    </section>
  );
}
