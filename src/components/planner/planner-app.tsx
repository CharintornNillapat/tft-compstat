"use client";

import { useMemo, useState, type ReactNode } from "react";
import { buildTeamCode, TEAM_PLANNER_SLOTS, teamCodeHint } from "@/lib/curated/team-code";
import { computeActiveTraits, isActive } from "@/lib/curated/traits";
import {
  equipItem,
  moveUnit,
  placeUnit,
  removeUnit,
  sameHex,
  setStar,
  toPlannerUnits,
  toTraitUnits,
  unequipItem,
  unitAt,
  type BoardResult,
  type Hex,
} from "@/lib/planner/board";
import type { PlannerData } from "@/lib/planner/catalog";
import {
  cleanCompName,
  deleteComp,
  DRAFT_KEY,
  duplicateComp,
  MAX_COMP_NAME,
  parseDraft,
  parseSavedComps,
  SAVED_COMPS_KEY,
  saveComp,
  serializeDraft,
  serializeSavedComps,
  toggleFavorite,
  type Draft,
  type SavedComp,
} from "@/lib/planner/saved-comps";
import { ChampionIcon } from "../champion-icon";
import { CompTraitList } from "../comp-traits";
import { CopyTeamCodeButton } from "../copy-team-code-button";
import { ItemIcon } from "../item-icon";
import { Segmented } from "../segmented";
import { TOGGLE_BUTTON, TOGGLE_OFF } from "../toggle-group";
import { ChampionPicker } from "./champion-picker";
import { ConfirmButton } from "./confirm-button";
import { ItemPicker } from "./item-picker";
import { PlannerBoard } from "./planner-board";
import { SavedCompList } from "./saved-comp-list";
import { UnitInspector } from "./unit-inspector";
import { usePointerDrag, type DragPayload } from "./use-pointer-drag";
import { useStoredValue, writeStored } from "./use-stored-value";

type View = "builder" | "saved";
type Armed = { type: "champion"; apiName: string } | { type: "move"; from: Hex } | null;
type Status = { tone: "info" | "ok" | "error"; text: string } | null;

const EMPTY_DRAFT: Draft = { id: null, name: "", units: [] };

const STATUS_TONE = { info: "text-muted", ok: "text-buff", error: "text-nerf" } as const;

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    // randomUUID needs a secure context; a plain-http LAN address has none.
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/**
 * `/planner` (architecture §9, Phase 6 Task 16). The board in progress and the saved
 * comps are both read straight from localStorage on every render (`useStoredValue`), so
 * edits persist as they happen and a reload or a second tab picks them up. Everything
 * else here — the selection, an armed champion, the status line — is per-view state.
 */
export function PlannerApp({ data }: { data: PlannerData }) {
  const { catalog } = data;
  const mutator = data.set.mutator;
  const traitMap = useMemo(() => new Map(Object.entries(data.traits)), [data.traits]);
  const champions = useMemo(() => Object.values(catalog.champions), [catalog]);
  const items = useMemo(() => Object.values(catalog.items), [catalog]);

  const draftRaw = useStoredValue(DRAFT_KEY);
  const savedRaw = useStoredValue(SAVED_COMPS_KEY);
  const draft = useMemo(() => parseDraft(draftRaw ?? null, catalog, mutator) ?? EMPTY_DRAFT, [draftRaw, catalog, mutator]);
  const saved = useMemo(() => parseSavedComps(savedRaw ?? null, catalog, mutator), [savedRaw, catalog, mutator]);
  const ready = savedRaw !== undefined;
  const board = draft.units;

  const [view, setView] = useState<View>("builder");
  const [picker, setPicker] = useState<"champions" | "items">("champions");
  const [selected, setSelected] = useState<Hex | null>(null);
  const [armed, setArmed] = useState<Armed>(null);
  const [status, setStatus] = useState<Status>(null);
  const [notPersisted, setNotPersisted] = useState(false);

  const nameOf = (apiName: string) => catalog.champions[apiName]?.name ?? apiName;
  const commitDraft = (next: Draft) => {
    if (!writeStored(DRAFT_KEY, serializeDraft(next, mutator))) setNotPersisted(true);
  };
  const commitSaved = (comps: readonly SavedComp[]) => {
    if (!writeStored(SAVED_COMPS_KEY, serializeSavedComps(comps))) setNotPersisted(true);
  };
  const apply = (result: BoardResult, success: string): boolean => {
    if (result.error) {
      setStatus({ tone: "error", text: result.error });
      return false;
    }
    commitDraft({ ...draft, units: result.board });
    setStatus({ tone: "ok", text: success });
    return true;
  };

  const place = (apiName: string, hex: Hex) => {
    const occupant = unitAt(board, hex);
    const replacing = occupant && occupant.apiName !== apiName ? `, replacing ${nameOf(occupant.apiName)}` : "";
    if (apply(placeUnit(board, apiName, hex, catalog), `Placed ${nameOf(apiName)}${replacing}.`)) setSelected(hex);
  };
  const move = (from: Hex, to: Hex) => {
    const unit = unitAt(board, from);
    const other = unitAt(board, to);
    if (!unit || sameHex(from, to)) return;
    const text = other ? `Swapped ${nameOf(unit.apiName)} and ${nameOf(other.apiName)}.` : `Moved ${nameOf(unit.apiName)}.`;
    if (apply(moveUnit(board, from, to), text)) setSelected(to);
  };
  const remove = (hex: Hex) => {
    const unit = unitAt(board, hex);
    if (unit && apply(removeUnit(board, hex), `Removed ${nameOf(unit.apiName)}.`)) {
      setSelected(null);
      setArmed(null);
    }
  };
  const equip = (hex: Hex, apiName: string) => {
    const unit = unitAt(board, hex);
    if (!unit) {
      setStatus({ tone: "error", text: "Select a unit on the board first." });
      return;
    }
    if (apply(equipItem(board, hex, apiName, catalog), `Gave ${catalog.items[apiName]?.name ?? apiName} to ${nameOf(unit.apiName)}.`)) {
      setSelected(hex);
    }
  };

  const activateHex = (hex: Hex) => {
    if (armed?.type === "champion") {
      place(armed.apiName, hex);
      setArmed(null);
    } else if (armed?.type === "move") {
      move(armed.from, hex);
      setArmed(null);
    } else {
      const unit = unitAt(board, hex);
      setSelected(unit && !(selected && sameHex(selected, hex)) ? hex : null);
    }
  };

  const pickChampion = (apiName: string) => {
    if (armed?.type === "champion" && armed.apiName === apiName) {
      setArmed(null);
      setStatus(null);
      return;
    }
    setArmed({ type: "champion", apiName });
    setStatus({ tone: "info", text: `Tap a hex to place ${nameOf(apiName)}. Esc cancels.` });
  };

  const onDrop = (payload: DragPayload, over: Hex | null) => {
    if (payload.type === "champion") {
      if (over) place(payload.apiName, over);
    } else if (payload.type === "unit") {
      if (over) move(payload.hex, over);
      else remove(payload.hex);
    } else if (over) {
      equip(over, payload.apiName);
    }
    setArmed(null);
  };
  const { drag, dragProps, wasDrag } = usePointerDrag(onDrop);

  const traits = useMemo(() => computeActiveTraits(toTraitUnits(board, catalog), traitMap), [board, catalog, traitMap]);
  const teamCode = useMemo(() => buildTeamCode(toPlannerUnits(board, catalog), mutator), [board, catalog, mutator]);
  const selectedUnit = selected ? unitAt(board, selected) : undefined;
  const editing = saved.comps.find((comp) => comp.id === draft.id);
  const dirty = editing
    ? editing.name !== cleanCompName(draft.name) || JSON.stringify(editing.units) !== JSON.stringify(board)
    : board.length > 0;
  const overflow = teamCode?.skipped.filter((unit) => unit.reason === "full") ?? [];

  const save = (asNew: boolean) => {
    if (board.length === 0) {
      setStatus({ tone: "error", text: "Place at least one champion before saving." });
      return;
    }
    const id = !asNew && editing ? editing.id : newId();
    const result = saveComp(saved.comps, { id, name: draft.name, set: mutator, units: board, now: new Date().toISOString() });
    if (result.error) {
      setStatus({ tone: "error", text: result.error });
      return;
    }
    const name = cleanCompName(draft.name);
    commitSaved(result.comps);
    commitDraft({ ...draft, id, name });
    setStatus({ tone: "ok", text: `Saved “${name}” to My Planner.` });
  };

  const resetEditor = (next: Draft, text: string) => {
    commitDraft(next);
    setSelected(null);
    setArmed(null);
    setStatus({ tone: "ok", text });
  };

  const ghost = drag ? dragGhost(drag.payload) : null;
  function dragGhost(payload: DragPayload): ReactNode {
    if (payload.type === "item") {
      const item = catalog.items[payload.apiName];
      return <ItemIcon name={item?.name ?? ""} iconUrl={item?.iconUrl ?? null} size={32} alt="" />;
    }
    const apiName = payload.type === "champion" ? payload.apiName : unitAt(board, payload.hex)?.apiName;
    const champion = apiName ? catalog.champions[apiName] : undefined;
    return champion ? <ChampionIcon name={champion.name} cost={champion.cost} iconUrl={champion.iconUrl} size={44} alt="" /> : null;
  }

  return (
    <div
      onKeyDown={(event) => {
        if (event.key === "Escape" && armed) {
          setArmed(null);
          setStatus(null);
        }
      }}
    >
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Segmented
          label="View"
          options={[
            { value: "builder", label: "Builder" },
            { value: "saved", label: ready ? `My Planner (${saved.comps.length})` : "My Planner" },
          ]}
          value={view}
          onChange={setView}
        />
        {notPersisted ? (
          <p className="text-xs text-nerf">This browser isn&apos;t keeping planner data; it lasts until you close the tab.</p>
        ) : null}
      </div>

      {view === "saved" ? (
        <SavedCompList
          comps={saved.comps}
          issues={saved.issues}
          ready={ready}
          catalog={catalog}
          traits={traitMap}
          mutator={mutator}
          editingId={draft.id}
          dirty={dirty}
          onLoad={(comp) => {
            resetEditor({ id: comp.id, name: comp.name, units: comp.units }, `Loaded “${comp.name}”.`);
            setView("builder");
          }}
          onDuplicate={(id) => {
            const result = duplicateComp(saved.comps, id, newId(), new Date().toISOString());
            if (result.error) setStatus({ tone: "error", text: result.error });
            else commitSaved(result.comps);
          }}
          onDelete={(id) => commitSaved(deleteComp(saved.comps, id))}
          onFavorite={(id) => commitSaved(toggleFavorite(saved.comps, id))}
        />
      ) : (
        <div className="grid items-start gap-3 md:grid-cols-12">
          <Panel title="Board" className="order-1 md:col-span-7">
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <input
                type="text"
                value={draft.name}
                maxLength={MAX_COMP_NAME}
                onChange={(event) => commitDraft({ ...draft, name: event.target.value })}
                placeholder="Name this comp"
                aria-label="Comp name"
                className="h-7 min-w-0 flex-1 basis-40 rounded border border-line bg-surface px-2 placeholder:text-faint"
              />
              <button
                type="button"
                disabled={!ready || (editing !== undefined && !dirty)}
                onClick={() => save(false)}
                className={`${TOGGLE_BUTTON} border-accent/60 bg-accent/10 text-fg hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-40`}
              >
                {editing ? (dirty ? "Save changes" : "Saved") : "Save"}
              </button>
              {editing ? (
                <button type="button" disabled={!ready} onClick={() => save(true)} className={`${TOGGLE_BUTTON} ${TOGGLE_OFF}`}>
                  Save as new
                </button>
              ) : null}
              <ConfirmButton
                label="New"
                confirmLabel="Discard changes?"
                needsConfirm={dirty}
                disabled={board.length === 0 && draft.id === null && draft.name === ""}
                onConfirm={() => resetEditor(EMPTY_DRAFT, "Started a new comp.")}
              />
            </div>

            <PlannerBoard
              board={board}
              catalog={catalog}
              selected={selected}
              moveFrom={armed?.type === "move" ? armed.from : null}
              placing={armed !== null}
              over={drag?.over ?? null}
              onActivate={activateHex}
              onRemove={remove}
              dragProps={dragProps}
              wasDrag={wasDrag}
            />

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
              <span className="text-muted tabular-nums">
                {board.length} {board.length === 1 ? "unit" : "units"}
                {editing ? ` · editing “${editing.name}”${dirty ? ", unsaved" : ""}` : ""}
              </span>
              {overflow.length ? (
                <span
                  className="text-contested"
                  title={`Team Planner codes hold ${TEAM_PLANNER_SLOTS} units, taken by items, then cost. Left out: ${overflow.map((unit) => unit.name).join(", ")}.`}
                >
                  ⚠ Over {TEAM_PLANNER_SLOTS}: the team code leaves out {overflow.map((unit) => unit.name).join(", ")}
                </span>
              ) : null}
              <span className="ml-auto flex flex-wrap items-center gap-2">
                {teamCode ? (
                  <CopyTeamCodeButton code={teamCode.code} hint={teamCodeHint(teamCode)} />
                ) : (
                  <span className="text-faint">Place units to get a team code</span>
                )}
                <ConfirmButton
                  label="Clear board"
                  confirmLabel="Clear all units?"
                  disabled={board.length === 0}
                  onConfirm={() => resetEditor({ ...draft, units: [] }, "Cleared the board.")}
                />
              </span>
            </div>

            <p role="status" aria-live="polite" className={`mt-2 min-h-4 text-xs ${status ? STATUS_TONE[status.tone] : ""}`}>
              {status?.text}
            </p>

            <div className="mt-2 border-t border-line pt-2">
              <UnitInspector
                unit={selectedUnit}
                catalog={catalog}
                moving={armed?.type === "move"}
                onStar={(star) => selected && apply(setStar(board, selected, star), `${nameOf(selectedUnit!.apiName)} set to ${star}★.`)}
                onUnequip={(index) => {
                  if (!selected || !selectedUnit) return;
                  const item = catalog.items[selectedUnit.items[index] ?? ""];
                  apply(unequipItem(board, selected, index), `Took ${item?.name ?? "the item"} off ${nameOf(selectedUnit.apiName)}.`);
                }}
                onMove={() => {
                  if (!selected) return;
                  if (armed?.type === "move") {
                    setArmed(null);
                    setStatus(null);
                  } else {
                    setArmed({ type: "move", from: selected });
                    setStatus({ tone: "info", text: "Tap a hex to move there, or a unit to swap. Esc cancels." });
                  }
                }}
                onRemove={() => selected && remove(selected)}
              />
            </div>
          </Panel>

          <Panel
            title={`Traits${traits.some(isActive) ? ` · ${traits.filter(isActive).length} active` : ""}`}
            className="order-3 md:order-2 md:col-span-5"
          >
            {traits.length ? (
              <CompTraitList traits={traits} details={data.traitDetails} board={board.map((unit) => nameOf(unit.apiName))} />
            ) : (
              <p className="text-muted">Place champions to see their traits.</p>
            )}
          </Panel>

          <Panel title="Pick" className="order-2 md:order-3 md:col-span-12">
            <Segmented
              label="Show"
              options={[
                { value: "champions", label: "Champions" },
                { value: "items", label: "Items" },
              ]}
              value={picker}
              onChange={setPicker}
              className="mb-2"
            />
            {picker === "champions" ? (
              <ChampionPicker
                champions={champions}
                traitNames={catalog.traitNames}
                onBoard={new Set(board.map((unit) => unit.apiName))}
                armed={armed?.type === "champion" ? armed.apiName : null}
                onPick={pickChampion}
                dragProps={dragProps}
                wasDrag={wasDrag}
              />
            ) : (
              <ItemPicker
                items={items}
                traitNames={catalog.traitNames}
                target={selectedUnit ? nameOf(selectedUnit.apiName) : null}
                onPick={(apiName) => (selected ? equip(selected, apiName) : setStatus({ tone: "error", text: "Select a unit on the board first." }))}
                dragProps={dragProps}
                wasDrag={wasDrag}
              />
            )}
          </Panel>
        </div>
      )}

      {drag && ghost ? (
        <div
          aria-hidden
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 opacity-90 drop-shadow-lg"
          style={{ left: drag.x, top: drag.y }}
        >
          {ghost}
        </div>
      ) : null}
    </div>
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
