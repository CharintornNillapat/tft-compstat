"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { isHex, sameHex, unitAt, type Board, type Hex, type PlannerCatalog } from "@/lib/planner/board";
import { BOARD_COLS, BOARD_ROWS } from "@/lib/static/game";
import { BOARD_ASPECT_RATIO, EmptyHex, hexBox, HexUnitFace } from "../hex-board";
import type { usePointerDrag } from "./use-pointer-drag";

const ROW_NAMES = ["Front row", "Second row", "Third row", "Back row"];

const ARROWS: Record<string, Hex> = {
  ArrowLeft: { row: 0, col: -1 },
  ArrowRight: { row: 0, col: 1 },
  ArrowUp: { row: -1, col: 0 },
  ArrowDown: { row: 1, col: 0 },
};

type Drag = ReturnType<typeof usePointerDrag>;

/**
 * The editable 4×7 board (architecture §9). Units are drawn by the comp board's own
 * `HexUnitFace`. One tab stop: arrow keys move between hexes, Enter acts on a hex
 * (place, move, select) and Delete removes its unit. Units drag by mouse, pen or touch.
 */
export function PlannerBoard({
  board,
  catalog,
  selected,
  moveFrom,
  placing,
  over,
  onActivate,
  onRemove,
  dragProps,
  wasDrag,
}: {
  board: Board;
  catalog: PlannerCatalog;
  selected: Hex | null;
  moveFrom: Hex | null;
  /** A champion or a move is armed, so empty hexes invite a tap. */
  placing: boolean;
  over: Hex | null;
  onActivate: (hex: Hex) => void;
  onRemove: (hex: Hex) => void;
  dragProps: Drag["dragProps"];
  wasDrag: Drag["wasDrag"];
}) {
  const [cursor, setCursor] = useState<Hex>({ row: 3, col: 3 });
  const buttons = useRef(new Map<string, HTMLButtonElement>());

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, hex: Hex) => {
    const step = ARROWS[event.key];
    if (step) {
      event.preventDefault();
      const next = { row: hex.row + step.row, col: hex.col + step.col };
      if (isHex(next)) {
        setCursor(next);
        buttons.current.get(`${next.row},${next.col}`)?.focus();
      }
    } else if ((event.key === "Delete" || event.key === "Backspace") && unitAt(board, hex)) {
      event.preventDefault();
      onRemove(hex);
    }
  };

  return (
    <figure className="m-0">
      <div
        role="group"
        aria-label="Board, front row at the top. Arrow keys move between hexes, Enter places or selects, Delete removes."
        className="relative mx-auto w-full max-w-lg select-none"
        style={{ aspectRatio: BOARD_ASPECT_RATIO }}
      >
        {Array.from({ length: BOARD_ROWS }, (_, row) =>
          Array.from({ length: BOARD_COLS }, (_, col) => {
            const hex = { row, col };
            const key = `${row},${col}`;
            const unit = unitAt(board, hex);
            const champion = unit ? catalog.champions[unit.apiName] : undefined;
            const name = champion?.name ?? unit?.apiName ?? "";
            const items = (unit?.items ?? []).map((apiName) => ({
              name: catalog.items[apiName]?.name ?? apiName,
              iconUrl: catalog.items[apiName]?.iconUrl ?? null,
            }));
            const isOver = over !== null && sameHex(over, hex);
            const isMarked = isOver || (selected !== null && sameHex(selected, hex)) || (moveFrom !== null && sameHex(moveFrom, hex));
            const label = unit
              ? `${name}, ${unit.star}-star, ${ROW_NAMES[row]}, column ${col + 1}${items.length ? `, holds ${items.map((item) => item.name).join(", ")}` : ""}`
              : `${ROW_NAMES[row]}, column ${col + 1}, empty`;
            return (
              <div key={key} className="absolute" style={hexBox(row, col)}>
                <button
                  type="button"
                  ref={(element) => {
                    if (element) buttons.current.set(key, element);
                    else buttons.current.delete(key);
                  }}
                  data-hex={key}
                  tabIndex={sameHex(cursor, hex) ? 0 : -1}
                  aria-label={label}
                  aria-pressed={unit ? selected !== null && sameHex(selected, hex) : undefined}
                  onFocus={() => setCursor(hex)}
                  onClick={() => {
                    if (wasDrag()) return;
                    setCursor(hex);
                    onActivate(hex);
                  }}
                  onKeyDown={(event) => onKeyDown(event, hex)}
                  {...(unit ? dragProps({ type: "unit", hex }, { touch: true }) : {})}
                  className="group absolute inset-0 touch-none rounded-sm [-webkit-touch-callout:none] [&_img]:pointer-events-none"
                >
                  {isMarked ? (
                    <span aria-hidden className={`hex absolute inset-0 ${isOver ? "bg-fg/80" : "bg-accent"}`} />
                  ) : null}
                  {unit ? (
                    <HexUnitFace
                      unit={{ name, cost: champion?.cost ?? 0, iconUrl: champion?.iconUrl ?? null, star: unit.star, isCarry: false, items }}
                    />
                  ) : (
                    <EmptyHex className={placing ? "bg-line group-hover:bg-accent/40" : "bg-line/60 group-hover:bg-line"} />
                  )}
                </button>
              </div>
            );
          }),
        )}
      </div>
      <figcaption className="mt-2 text-center text-xs text-faint">
        Front row at the top · drag a unit to move or swap it, or off the board to remove it
      </figcaption>
    </figure>
  );
}
