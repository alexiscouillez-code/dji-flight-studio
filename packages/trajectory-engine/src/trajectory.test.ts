import { describe, expect, it } from "vitest";
import type { Waypoint } from "@dfs/shared-types";
import { catmullRomPoint, samplePath } from "./spline";
import { trapezoidDuration } from "./motion";
import { computeTrajectory, TrajectoryError } from "./trajectory";

let n = 0;
const wp = (lat: number, lon: number, alt: number, extra: Partial<Waypoint> = {}): Waypoint => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
  position: { lat, lon },
  altitude: { valueM: alt, reference: "takeoff_relative", source: "user" },
  pauseS: 0,
  cameraMode: "free",
  ...extra,
});

describe("spline", () => {
  it("Catmull-Rom passes through control points", () => {
    const P = [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 20, y: 10, z: 5 }, { x: 30, y: 10, z: 5 }];
    const a = catmullRomPoint(P[0]!, P[1]!, P[2]!, P[3]!, 0);
    const b = catmullRomPoint(P[0]!, P[1]!, P[2]!, P[3]!, 1);
    expect(a.x).toBeCloseTo(10); expect(b.x).toBeCloseTo(20); expect(b.z).toBeCloseTo(5);
  });
  it("collinear points give a straight line", () => {
    const segs = samplePath([{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 20, y: 0, z: 0 }], "catmull-rom", 8);
    for (const s of segs) for (const p of s) { expect(p.y).toBeCloseTo(0); expect(p.z).toBeCloseTo(0); }
  });
});

describe("trapezoidDuration", () => {
  it("trapezoid: 100 m, 5 m/s, 2 m/s² → 22.5 s", () => {
    expect(trapezoidDuration(100, 5, 2).durationS).toBeCloseTo(22.5);
  });
  it("triangle when distance is short", () => {
    const r = trapezoidDuration(4, 5, 2);
    expect(r.peakMs).toBeCloseTo(Math.sqrt(8));
    expect(r.durationS).toBeCloseTo(2 * Math.sqrt(8) / 2);
  });
});

describe("computeTrajectory", () => {
  it("linear: straight 3D segment length and stats", () => {
    // ~111.2 m north, +30 m altitude
    const r = computeTrajectory([wp(45, 6, 20), wp(45.001, 6, 50, { pauseS: 3 })], { interpolation: "linear" });
    expect(r.isSimulation).toBe(true);
    expect(r.totalDistanceM).toBeCloseTo(Math.hypot(111.2, 30), 0);
    expect(r.minAltitudeM).toBe(20);
    expect(r.maxAltitudeM).toBe(50);
    expect(r.segments).toHaveLength(1);
    expect(r.estimatedDurationS).toBeGreaterThan(r.totalDistanceM / 5);
  });
  it("refuses mixed altitude references", () => {
    const b = wp(45.001, 6, 50);
    b.altitude.reference = "agl";
    expect(() => computeTrajectory([wp(45, 6, 20), b])).toThrow(TrajectoryError);
  });
  it("handles 0 and 1 waypoint", () => {
    expect(computeTrajectory([]).totalDistanceM).toBe(0);
    expect(computeTrajectory([wp(45, 6, 10)]).path).toHaveLength(1);
  });
  it("spline length ≥ chord length", () => {
    const pts = [wp(45, 6, 20), wp(45.001, 6.001, 30), wp(45.002, 6, 40)];
    const lin = computeTrajectory(pts, { interpolation: "linear" }).totalDistanceM;
    const cr = computeTrajectory(pts, { interpolation: "catmull-rom" }).totalDistanceM;
    expect(cr).toBeGreaterThanOrEqual(lin - 1e-6);
  });
});
