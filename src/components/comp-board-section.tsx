"use client";

import { useState } from "react";
import type { CompDetail } from "@/lib/curated/queries";
import { CompTraitList } from "./comp-traits";
import { HexBoard } from "./hex-board";

/**
 * Interactive board and traits section with synchronized trait cross-highlighting.
 * Hovering or focusing a trait highlights all champions on the board that carry it.
 */
export function CompBoardSection({ comp }: { comp: CompDetail }) {
  const [highlightedTrait, setHighlightedTrait] = useState<string | null>(null);

  return (
    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_15rem]">
      <section className="min-w-0 rounded-md border border-line bg-panel p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[11px] font-medium tracking-wider text-faint uppercase">Board</h2>
          {highlightedTrait ? (
            <span className="flex items-center gap-1.5 text-xs text-accent">
              <span className="size-1.5 rounded-full bg-accent animate-pulse" />
              <span>
                Highlighting <strong className="font-semibold">{highlightedTrait}</strong>
              </span>
              <button
                type="button"
                onClick={() => setHighlightedTrait(null)}
                className="ml-1 text-[11px] text-muted hover:text-fg"
                title="Clear trait highlight"
              >
                ✕
              </button>
            </span>
          ) : null}
        </div>
        <HexBoard units={comp.units} highlightedTrait={highlightedTrait} />
      </section>

      <section className="min-w-0 rounded-md border border-line bg-panel p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[11px] font-medium tracking-wider text-faint uppercase">Traits</h2>
          <span className="text-[10px] text-faint">Hover to highlight</span>
        </div>
        <CompTraitList
          traits={comp.traits}
          details={comp.traitDetails}
          board={comp.units.map((unit) => unit.name)}
          onHoverTrait={setHighlightedTrait}
        />
      </section>
    </div>
  );
}
