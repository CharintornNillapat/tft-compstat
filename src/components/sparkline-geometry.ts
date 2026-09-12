/**
 * Sparkline coordinates, kept separate from the component so the arithmetic is
 * testable — the test suite is node-only and has no DOM (architecture §2 keeps
 * charts as inline SVG, with no chart library).
 */

export type SparklinePoint = { x: number; y: number; value: number; index: number };
export type SparklineGeometry = {
  points: SparklinePoint[];
  /** An SVG polyline `points` string. */
  path: string;
  width: number;
  height: number;
};

export function sparklineGeometry(
  values: readonly number[],
  options: {
    /**
     * Required on purpose. Placements always span 1–8, and fixing the domain kills
     * the divide-by-zero case: a run of identical values sits where that value
     * belongs rather than at an ambiguous mid-height.
     */
    domain: readonly [number, number];
    width?: number;
    height?: number;
    /** True puts the domain's low end at the top, which is what 1st place wants. */
    invert?: boolean;
    padding?: number;
  },
): SparklineGeometry | null {
  const { domain, width = 100, height = 32, invert = false, padding = 3 } = options;
  if (values.length === 0) return null;

  const [low, high] = domain;
  const span = high - low || 1;
  const usable = Math.max(height - padding * 2, 0);
  // One value has no span to spread across, so it sits centred rather than at x=0.
  const step = values.length === 1 ? 0 : width / (values.length - 1);

  const points = values.map((value, index) => {
    const clamped = Math.min(Math.max(value, low), high);
    const ratio = (clamped - low) / span;
    return {
      x: values.length === 1 ? width / 2 : index * step,
      y: padding + (invert ? ratio : 1 - ratio) * usable,
      value,
      index,
    };
  });

  return {
    points,
    path: points.map((point) => `${round(point.x)},${round(point.y)}`).join(" "),
    width,
    height,
  };
}

/** Two decimals is well under a pixel at any size we render, and keeps the DOM small. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}
