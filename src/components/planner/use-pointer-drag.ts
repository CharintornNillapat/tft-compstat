"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Hex } from "@/lib/planner/board";

/*
 * Drag and drop on Pointer Events (architecture §9, Phase 6 Task 16), one code path for
 * mouse, pen and touch. HTML5 drag-and-drop is not used: it never fires for touch.
 *
 * A press becomes a drag only after it moves 6px, so a tap stays a click. Drop targets
 * are found with `elementFromPoint` against `[data-hex]`, which works while the pointer
 * is implicitly captured. Touch drags are opt-in per source (`{ touch: true }`): a board
 * hex has `touch-action: none` and can take them, while a picker tile must keep
 * scrolling the page, so on a phone the picker is tap-to-place instead.
 *
 * Holding a drag near the top or bottom of the window scrolls the page. Below `md` the
 * picker sits under the board, and at the ~960px half-width window a tile low in the
 * list and the board do not fit on screen together; without this, those tiles could
 * not be dragged onto the board at all.
 */

export type DragPayload =
  | { type: "champion"; apiName: string }
  | { type: "unit"; hex: Hex }
  | { type: "item"; apiName: string };

export type DragState = { payload: DragPayload; x: number; y: number; over: Hex | null };

const THRESHOLD_PX = 6;
const EDGE_PX = 56;
const MAX_SCROLL_PX = 18;

function hexAt(x: number, y: number): Hex | null {
  const element = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-hex]");
  const [row, col] = (element?.dataset.hex ?? "").split(",").map(Number);
  return row === undefined || col === undefined || Number.isNaN(row) || Number.isNaN(col) ? null : { row, col };
}

/** Pixels to scroll this frame: faster the deeper the pointer is into the top or bottom edge band. */
function edgeScroll(y: number, height: number): number {
  if (y < EDGE_PX) return -Math.ceil(((EDGE_PX - Math.max(y, 0)) / EDGE_PX) * MAX_SCROLL_PX);
  if (y > height - EDGE_PX) return Math.ceil(((Math.min(y, height) - (height - EDGE_PX)) / EDGE_PX) * MAX_SCROLL_PX);
  return 0;
}

type Press = { payload: DragPayload; x: number; y: number; id: number; started: boolean; lastX: number; lastY: number };

export function usePointerDrag(onDrop: (payload: DragPayload, over: Hex | null) => void) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const pending = useRef<Press | null>(null);
  const justDropped = useRef(false);
  const latestOnDrop = useRef(onDrop);

  useEffect(() => {
    latestOnDrop.current = onDrop;
  });

  useEffect(() => {
    let frame = 0;
    const autoScroll = () => {
      const press = pending.current;
      if (!press?.started) {
        frame = 0;
        return;
      }
      const step = edgeScroll(press.lastY, window.innerHeight);
      if (step !== 0) {
        window.scrollBy(0, step);
        // The page moved under a still pointer, so the hex beneath it may have changed.
        setDrag((current) => current && { ...current, over: hexAt(press.lastX, press.lastY) });
      }
      frame = requestAnimationFrame(autoScroll);
    };

    const move = (event: PointerEvent) => {
      const press = pending.current;
      if (!press || event.pointerId !== press.id) return;
      if (!press.started) {
        if (Math.hypot(event.clientX - press.x, event.clientY - press.y) < THRESHOLD_PX) return;
        press.started = true;
        window.getSelection()?.removeAllRanges();
      }
      press.lastX = event.clientX;
      press.lastY = event.clientY;
      if (!frame) frame = requestAnimationFrame(autoScroll);
      setDrag({ payload: press.payload, x: event.clientX, y: event.clientY, over: hexAt(event.clientX, event.clientY) });
    };
    const end = (event: PointerEvent) => {
      const press = pending.current;
      if (!press || event.pointerId !== press.id) return;
      pending.current = null;
      setDrag(null);
      if (!press.started || event.type === "pointercancel") return;
      // The click that follows this pointerup must not also count as a tap.
      justDropped.current = true;
      setTimeout(() => {
        justDropped.current = false;
      }, 0);
      latestOnDrop.current(press.payload, hexAt(event.clientX, event.clientY));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, []);

  /** Spread on a drag source. */
  const dragProps = (payload: DragPayload, { touch = false }: { touch?: boolean } = {}) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0 || (event.pointerType === "touch" && !touch)) return;
      const { clientX: x, clientY: y } = event;
      pending.current = { payload, x, y, id: event.pointerId, started: false, lastX: x, lastY: y };
    },
  });

  /** True inside the click that ends a drag; call it from click handlers only. */
  const wasDrag = () => justDropped.current;

  return { drag, dragProps, wasDrag };
}
