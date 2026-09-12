import { placementBand } from "./placement-styles";
import { sparklineGeometry } from "./sparkline-geometry";

/**
 * Placement trend as inline SVG (architecture §2 — no chart library at this scale).
 *
 * Values run **oldest to newest**, left to right, so time flows the way a reader
 * expects. `PlayerSummary.recent` is newest-first per §6.3, so callers reverse it;
 * the pill row beneath the chart uses the same direction so the two never disagree.
 *
 * The line is a stretched SVG but the dots are positioned HTML, because an SVG
 * circle inside `preserveAspectRatio="none"` stretches into an ellipse — badly, at
 * the ~3× horizontal scale this renders at.
 *
 * Accessibility: the chart never carries information that isn't also on screen as
 * text — the same placements are printed as pills below it and counted in the
 * histogram — so `role="img"` with a generated label is the whole story.
 */
const DOT_COLOR = {
  win: "bg-place-win",
  top4: "bg-place-top4",
  bot4: "bg-place-bot4",
} as const;

export function Sparkline({
  values,
  domain = [1, 8],
  invert = true,
  height = 36,
  label,
  className = "",
}: {
  values: readonly number[];
  domain?: readonly [number, number];
  invert?: boolean;
  height?: number;
  /** Accessible name. Required — an unlabelled chart is just decoration. */
  label: string;
  className?: string;
}) {
  const geometry = sparklineGeometry(values, { domain, width: 100, height, invert, padding: 4 });
  if (!geometry) return null;

  const lastIndex = geometry.points.length - 1;

  return (
    <div role="img" aria-label={label} className={`relative w-full ${className}`} style={{ height }}>
      {geometry.points.length > 1 && (
        <svg
          aria-hidden
          viewBox={`0 0 ${geometry.width} ${geometry.height}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
        >
          <polyline
            points={geometry.path}
            fill="none"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            className="stroke-line"
          />
        </svg>
      )}
      {geometry.points.map((point) => {
        const newest = point.index === lastIndex;
        const size = newest ? 6 : 4;
        return (
          <span
            key={point.index}
            aria-hidden
            className={`absolute rounded-full ${DOT_COLOR[placementBand(point.value)]} ${
              newest ? "ring-1 ring-surface" : ""
            }`}
            style={{
              left: `${point.x}%`,
              top: `${(point.y / geometry.height) * 100}%`,
              width: size,
              height: size,
              transform: "translate(-50%, -50%)",
            }}
          />
        );
      })}
    </div>
  );
}
