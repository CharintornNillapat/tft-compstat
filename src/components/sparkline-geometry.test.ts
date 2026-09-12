import { describe, expect, it } from "vitest";
import { sparklineGeometry } from "./sparkline-geometry";

const geom = (values: number[], over: Partial<Parameters<typeof sparklineGeometry>[1]> = {}) =>
  sparklineGeometry(values, { domain: [1, 8], width: 100, height: 32, padding: 3, ...over });

describe("sparklineGeometry", () => {
  it("returns null for no values, so the component can render nothing", () => {
    expect(geom([])).toBeNull();
  });

  it("centres a single value instead of pinning it to the left edge", () => {
    const result = geom([4]);
    expect(result?.points).toHaveLength(1);
    expect(result?.points[0]?.x).toBe(50);
  });

  it("spaces points evenly across the full width", () => {
    expect(geom([1, 2, 3, 4, 5])?.points.map((p) => p.x)).toEqual([0, 25, 50, 75, 100]);
  });

  it("inverts so that 1st place is at the top and 8th at the bottom", () => {
    const points = geom([1, 8], { invert: true })!.points;
    expect(points[0]!.y).toBe(3);
    expect(points[1]!.y).toBe(29);
    expect(points[0]!.y).toBeLessThan(points[1]!.y);
  });

  it("puts the low end at the bottom when not inverted", () => {
    const points = geom([1, 8], { invert: false })!.points;
    expect(points[0]!.y).toBeGreaterThan(points[1]!.y);
  });

  it("places a run of identical values at that value's height, not at mid-height", () => {
    // The reason `domain` is required: with a derived domain this would divide by zero.
    const flat = geom([4, 4, 4], { invert: true })!;
    const single = geom([4], { invert: true })!;
    expect(new Set(flat.points.map((p) => p.y)).size).toBe(1);
    expect(flat.points[0]!.y).toBe(single.points[0]!.y);
  });

  it("clamps a value outside the domain rather than drawing outside the box", () => {
    const points = geom([0, 99], { invert: true })!.points;
    expect(points[0]!.y).toBe(3);
    expect(points[1]!.y).toBe(29);
  });

  it("emits a polyline string with one coordinate pair per value", () => {
    const result = geom([1, 4, 8])!;
    expect(result.path.split(" ")).toHaveLength(3);
    expect(result.path).toMatch(/^[\d.,\s]+$/);
  });

  it("reports back the box it drew into", () => {
    expect(geom([1, 2], { width: 200, height: 40 })).toMatchObject({ width: 200, height: 40 });
  });
});
