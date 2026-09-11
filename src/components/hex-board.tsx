"use client";

import Image from "next/image";
import type { CompUnit } from "@/lib/curated/queries";
import { BOARD_COLS, BOARD_ROWS } from "@/lib/static/game";
import { StarPips, UnitDetails } from "./comp-details";
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
const ASPECT_RATIO = WIDTH_HEXES / (HEIGHT_HEXES * (2 / Math.sqrt(3)));

const percent = (value: number) => `${(value * 100).toFixed(3)}%`;

/** Where hex (row, col) sits, as percentages of the board. */
function hexBox(row: number, col: number) {
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
        style={{ aspectRatio: ASPECT_RATIO }}
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
                    {unit.isCarry ? <span aria-hidden className="hex absolute inset-0.5 bg-accent" /> : null}
                    <span
                      aria-hidden
                      className={`hex absolute ${unit.isCarry ? "inset-1.25" : "inset-0.5"} ${COST_BG[unit.cost] ?? "bg-line"}`}
                    />
                    <span
                      aria-hidden
                      className={`hex absolute ${unit.isCarry ? "inset-2" : "inset-1.25"} overflow-hidden bg-raised`}
                    >
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
                    {unit.items.length ? (
                      <span className="absolute inset-x-0 bottom-[6%] z-10 flex justify-center gap-px">
                        {unit.items.map((item, i) => (
                          <ItemIcon key={i} name={item.name} iconUrl={item.iconUrl} size={14} alt="" />
                        ))}
                      </span>
                    ) : null}
                  </button>
                ) : (
                  <span aria-hidden className="hex absolute inset-0.5 bg-line/60" />
                )}
              </div>
            );
          }),
        )}
      </div>
      <figcaption className="mt-2 text-center text-xs text-faint">
        Front row at the top · <span className="text-accent">gold rim</span> = carry
      </figcaption>
      {tip.active ? (
        <HoverTip id={tip.id} anchor={tip.active.anchor}>
          <UnitDetails unit={tip.active.item} />
        </HoverTip>
      ) : null}
    </figure>
  );
}
