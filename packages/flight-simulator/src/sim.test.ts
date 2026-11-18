import { describe, expect, it } from "vitest";
import { analyze, simulate, type TimedPoint } from "./index";

const line = (speed: number, secs: number): TimedPoint[] => Array.from({ length: secs * 10 + 1 }, (_, i) => ({ t: i / 10, pos: { x: 0, y: (speed * i) / 10, z: 20 } }));

describe("simulate", () => {
  it("ideal mode reproduces speed", () => {
    const s = simulate(line(5, 10), { mode: "ideal", maxSpeedMs: 8, maxAccelMs2: 3 });
    expect(s[50]!.speedMs).toBeCloseTo(5, 6);
    expect(s[50]!.trackingErrorM).toBe(0);
  });
  it("inertia mode respects speed and acceleration limits and lags behind", () => {
    const s = simulate(line(12, 10), { mode: "inertia", maxSpeedMs: 8, maxAccelMs2: 3 });
    expect(Math.max(...s.map((p) => p.speedMs))).toBeLessThanOrEqual(8 + 1e-9);
    expect(Math.max(...s.map((p) => p.accelMs2))).toBeLessThanOrEqual(3 + 1e-9);
    expect(s[s.length - 1]!.trackingErrorM).toBeGreaterThan(10);
  });
});

describe("analyze", () => {
  const base = { takeoffZ: 0, takeoff: { x: 0, y: 0, z: 0 }, subjectAt: () => ({ x: 10, y: 0, z: 0 }), maxSpeedMs: 4, maxAccelMs2: 3, minClearanceM: 10 };
  it("flags speed, low clearance and collisions; reports take-off-relative heights", () => {
    const sim = simulate(line(5, 4), { mode: "ideal", maxSpeedMs: 8, maxAccelMs2: 3 });
    const ground = sim.map((p) => (p.pos.y > 15 ? 25 : p.pos.y > 8 ? 15 : 0));
    const a = analyze({ ...base, sim, groundZ: ground });
    const codes = a.issues.map((i) => i.code);
    expect(codes).toContain("speed");
    expect(codes).toContain("clearance");
    expect(codes).toContain("collision");
    expect(a.maxHeightTakeoffM).toBe(20);
    expect(a.minClearanceM).toBeLessThan(0);
    expect(a.isSimulation).toBe(true);
  });
  it("no terrain → clearance unknown, not zero", () => {
    const sim = simulate(line(2, 2), { mode: "ideal", maxSpeedMs: 8, maxAccelMs2: 3 });
    expect(analyze({ ...base, sim, groundZ: [] }).minClearanceM).toBeNull();
  });
});
