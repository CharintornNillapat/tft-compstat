"use client";

import Image from "next/image";
import type { CompUnit } from "@/lib/curated/queries";
import { BOARD_COLS, BOARD_ROWS } from "@/lib/static/game";
import { CarryMark, StarPips, UnitDetails } from "./comp-details";
import { COST_BG } from "./cost-styles";
import { HoverTip, useHoverTip } from "./hover-tip";
import { ItemIcon } from "./item-icon";

/*
 * Pointy-top hexes, one hex width apart. Odd rows shift right by half a hex, and
 * rows overlap by a quarter of a hex's height (h = 2w/√3), so the board spans
 * (cols + ½) widths by (1 + ¾·(rows − 1)) heights.
 */
const WIDTH_HEXES = BOARD_COLS + 0.5;
const HEIGHT_HEXES = 1 + 0.75 * (BOARD_ROWS - 1);
export const BOARD_ASPECT_RATIO = WIDTH_HEXES / (HEIGHT_HEXES * (2 / Math.sqrt(3)));

const percent = (value: number) => `${(value * 100).toFixed(3)}%`;

/** Where hex (row, col) sits, as percentages of the board. */
export function hexBox(row: number, col: number) {
  return {
    left: percent((col + (row % 2) * 0.5) / WIDTH_HEXES),
    top: percent((row * 0.75) / HEIGHT_HEXES),
    width: percent(1 / WIDTH_HEXES),
    height: percent(1 / HEIGHT_HEXES),
  };
}

const ROW_NAMES = ["front row", "second row", "third row", "back row"];

function unitLabel(unit: CompUnit) {
  const items = unit.items.length ? `, holds ${unit.items.map((item) => item.name).join(", ")}` : "";
  return `${unit.name}, ${unit.star}-star${unit.isCarry ? " carry" : ""}, ${ROW_NAMES[unit.row]}, column ${unit.col + 1}${items}`;
}

/** What a hex draws for a unit: the comp board's `CompUnit` and the planner's units both fit. */
export type HexFaceUnit = {
  name: string;
  cost: number;
  iconUrl: string | null;
  star: number;
  isCarry: boolean;
  items: readonly { name: string; iconUrl: string | null }[];
};

/**
 * A unit's face inside a hex — cost rim, portrait, star pips, carry mark and items —
 * shared by the comp board and the planner so the two can never draw a unit differently.
 * Absolutely positioned; the parent (a button in both boards) is the hex's box.
 */
export function HexUnitFace({ unit }: { unit: HexFaceUnit }) {
  return (
    <>
      {unit.isCarry ? <span aria-hidden className="hex absolute inset-0.5 bg-carry" /> : null}
      <span
        aria-hidden
        className={`hex absolute ${unit.isCarry ? "inset-1.25" : "inset-0.5"} ${COST_BG[unit.cost] ?? "bg-line"}`}
      />
      <span aria-hidden className={`hex absolute ${unit.isCarry ? "inset-2" : "inset-1.25"} overflow-hidden bg-raised`}>
        {unit.iconUrl ? (
          <Image
            src={unit.iconUrl}
            alt=""
            width={64}
            height={64}
            className="size-full object-cover transition-transform group-hover:scale-110"
          />
        ) : (
          <span className="grid size-full place-items-center text-[10px] font-semibold text-muted">
            {unit.name.slice(0, 2)}
          </span>
        )}
      </span>
      <StarPips star={unit.star} className="absolute inset-x-0 top-0.5 z-10 text-center text-[10px]" />
      {unit.isCarry ? <CarryMark className="absolute right-0 bottom-[22%] z-10" /> : null}
      {unit.items.length ? (
        <span className="absolute inset-x-0 bottom-[6%] z-10 flex justify-center gap-px">
          {unit.items.map((item, i) => (
            <ItemIcon key={i} name={item.name} iconUrl={item.iconUrl} size={14} alt="" />
          ))}
        </span>
      ) : null}
    </>
  );
}

/** An empty hex's plate. */
export function EmptyHex({ className = "bg-line/60" }: { className?: string }) {
  return <span aria-hidden className={`hex absolute inset-0.5 ${className}`} />;
}

/** The 4×7 board (architecture §9), front row at the top. Units show details on hover. */
export function HexBoard({ units }: { units: CompUnit[] }) {
  const tip = useHoverTip<CompUnit>();
  const byHex = new Map(units.map((unit) => [`${unit.row},${unit.col}`, unit]));

  return (
    <figure className="m-0">
      <div
        role="group"
        aria-label="Board positions, front row at the top"
        className="relative mx-auto w-full max-w-lg"
        style={{ aspectRatio: BOARD_ASPECT_RATIO }}
      >
        {Array.from({ length: BOARD_ROWS }, (_, row) =>
          Array.from({ length: BOARD_COLS }, (_, col) => {
            const unit = byHex.get(`${row},${col}`);
            return (
              <div key={`${row},${col}`} className="absolute" style={hexBox(row, col)}>
                {unit ? (
                  <button
                    type="button"
                    {...tip.triggerProps(unit)}
                    aria-label={unitLabel(unit)}
                    className="group absolute inset-0 rounded-sm"
                  >
                    <HexUnitFace unit={unit} />
                  </button>
                ) : (
                  <EmptyHex />
                )}
              </div>
            );
          }),
        )}
      </div>
      <figcaption className="mt-2 text-center text-xs text-faint">
        Front row at the top · <CarryMark className="inline-block align-text-bottom" /> = carry
      </figcaption>
      {tip.active ? (
        <HoverTip id={tip.id} anchor={tip.active.anchor}>
          <UnitDetails unit={tip.active.item} />
        </HoverTip>
      ) : null}
    </figure>
  );
}
