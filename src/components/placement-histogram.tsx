import { ordinal, placementBand, PLACEMENT_FILL, PLACEMENT_TEXT } from "./placement-styles";
import type { PlacementDist } from "@/lib/stats/types";

const WIDTH = 100;
const HEIGHT = 40;
const GAP = 1.6;

/**
 * How often each placement came up, as inline SVG bars over a text list.
 *
 * The list isn't duplicated content — it's the axis a dense dashboard wants, and
 * it doubles as the entire accessible representation, so the bars are decorative.
 */
export function PlacementHistogram({ dist, className = "" }: { dist: PlacementDist; className?: string }) {
  const max = Math.max(...dist, 1);
  const slot = WIDTH / dist.length;

  return (
    <div className={className}>
      <svg
        aria-hidden
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height: HEIGHT }}
      >
        {dist.map((count, i) => {
          // A zero keeps a 1px stub, so the eight slots stay visible as a scale.
          const barHeight = count === 0 ? 1 : Math.max((count / max) * HEIGHT, 2);
          return (
            <rect
              key={i}
              x={i * slot + GAP / 2}
              y={HEIGHT - barHeight}
              width={slot - GAP}
              height={barHeight}
              className={count === 0 ? "fill-line" : PLACEMENT_FILL[placementBand(i + 1)]}
            />
          );
        })}
      </svg>
      <ol aria-label="Placement distribution" className="mt-1 grid grid-cols-8 gap-[1.6%] text-center">
        {dist.map((count, i) => (
          <li key={i} className="tabular-nums">
            <span className={`block text-[11px] ${PLACEMENT_TEXT[placementBand(i + 1)]}`}>{ordinal(i + 1)}</span>
            <span className="block text-faint">{count}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
