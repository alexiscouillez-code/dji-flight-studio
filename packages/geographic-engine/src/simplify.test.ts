import { describe, expect, it } from "vitest";
import { haversineDistanceM } from "./geodesy";
import { resampleByDistance, simplifyTrack } from "./simplify";

const line = Array.from({ length: 1001 }, (_, i) => ({ lat: 45 + i * 0.00001, lon: 6, ele: i }));

describe("simplifyTrack", () => {
  it("collapses a straight line to its endpoints", () => {
    const s = simplifyTrack(line);
    expect(s).toHaveLength(2);
    expect(s[0]).toBe(line[0]);
    expect(s[1]).toBe(line[1000]);
  });
  it("keeps a corner", () => {
    const pts = [{ lat: 45, lon: 6, ele: null }, { lat: 45.001, lon: 6, ele: null }, { lat: 45.001, lon: 6.001, ele: null }];
    expect(simplifyTrack(pts)).toHaveLength(3);
  });
  it("respects maxPoints on a noisy track", () => {
    const zig = Array.from({ length: 20000 }, (_, i) => ({ lat: 45 + i * 0.00001, lon: 6 + (i % 2) * 0.0002, ele: null }));
    const s = simplifyTrack(zig, { maxPoints: 500 });
    expect(s.length).toBeLessThanOrEqual(500);
    expect(s[0]).toBe(zig[0]);
  });
});

describe("resampleByDistance", () => {
  it("returns evenly spaced points with exact endpoints", () => {
    const r = resampleByDistance(line, 11);
    expect(r).toHaveLength(11);
    const total = haversineDistanceM(line[0]!, line[1000]!);
    // ENU (ellipsoid) vs haversine (sphere): agree within 0.5 %
    expect(Math.abs(r[10]!.distanceM - total) / total).toBeLessThan(0.005);
    expect(r[5]!.lat).toBeCloseTo(45.005, 5);
  });
});
