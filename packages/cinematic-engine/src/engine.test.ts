import { describe, expect, it } from "vitest";
import type { Shot } from "@dfs/shared-types";
import { MOVES, MOVES_BY_ID, defaultParams, evaluateSequence, lookAngles, planSequence, previewMove, sampleSequence, sanitizeParams } from "./index";

const shot = (moveId: string, durationS = 10, transitionS = 0, params = {}): Shot => ({ id: crypto.randomUUID(), moveId, durationS, transitionS, params: { ...defaultParams(moveId), ...params } });
const ctx = { subjectHeightM: 1.7 };

describe("library", () => {
  it("has the 20 moves of the brief + custom path, each producing finite samples", () => {
    expect(MOVES.filter((m) => m.id !== "custom-path")).toHaveLength(20);
    for (const m of MOVES) {
      for (const u of [0, 0.25, 0.5, 1]) {
        const s = m.sample(u, { ...defaultParams(m.id), __durationS: m.defaultDurationS }, { subjectTrack: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 300, z: 0 }], customPath: [{ x: 0, y: 0, z: 10 }, { x: 50, y: 0, z: 20 }] });
        for (const k of ["x", "y", "z"] as const) expect(Number.isFinite(s.drone[k]), `${m.id} ${k}`).toBe(true);
      }
      expect(previewMove(m.id)!.top).toHaveLength(80);
    }
  });
  it("Orbit 360 keeps radius and height and ends where it started", () => {
    const m = MOVES_BY_ID["orbit-360"]!;
    const p = defaultParams("orbit-360");
    for (const u of [0, 0.3, 0.7]) {
      const d = m.sample(u, p, ctx).drone;
      expect(Math.hypot(d.x, d.y)).toBeCloseTo(30, 6);
      expect(d.z).toBe(15);
    }
    const a = m.sample(0, p, ctx).drone, b = m.sample(1, p, ctx).drone;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1e-6);
  });
  it("Pull Out increases distance monotonically", () => {
    const m = MOVES_BY_ID["pull-out"]!;
    const p = defaultParams("pull-out");
    let last = -1;
    for (let i = 0; i <= 20; i++) { const d = m.sample(i / 20, p, ctx).drone; const r = Math.hypot(d.x, d.y); expect(r).toBeGreaterThanOrEqual(last); last = r; }
  });
  it("Follow keeps the drone behind a moving subject", () => {
    const m = MOVES_BY_ID["follow"]!;
    const s = m.sample(0.5, { ...defaultParams("follow"), __durationS: 20 }, { subjectTrack: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 1000, z: 0 }] });
    expect(s.subject.y).toBeCloseTo((9 / 3.6) * 10, 3); // 9 km/h for 10 s
    expect(s.drone.y).toBeLessThan(s.subject.y);
  });
  it("sanitizes params", () => {
    const p = sanitizeParams("orbit-360", { radius: 10000, direction: "nope", extra: 1 });
    expect(p.radius).toBe(400);
    expect(p.direction).toBe("cw");
    expect(p).not.toHaveProperty("extra");
  });
  it("camera angles", () => {
    const a = lookAngles({ x: 0, y: -10, z: 10 }, { x: 0, y: 0, z: 0 });
    expect(a.headingDeg).toBeCloseTo(0); expect(a.pitchDeg).toBeCloseTo(-45);
  });
});

describe("sequence", () => {
  it("plans durations with transitions", () => {
    const plan = planSequence([shot("orbit-partial", 10), shot("pull-out", 8, 2)]);
    expect(plan.durationS).toBe(20);
    expect(plan.shotStarts).toEqual([0, 12]);
  });
  it("transitions are continuous in position (C0) at both ends", () => {
    const plan = planSequence([shot("orbit-partial", 10), shot("pull-out", 8, 3)]);
    const before = evaluateSequence(plan, 10 - 1e-6, ctx)!.drone, start = evaluateSequence(plan, 10 + 1e-6, ctx)!.drone;
    expect(Math.hypot(before.x - start.x, before.y - start.y, before.z - start.z)).toBeLessThan(0.01);
    const tEnd = evaluateSequence(plan, 13 - 1e-6, ctx)!.drone, shotB = evaluateSequence(plan, 13 + 1e-6, ctx)!.drone;
    expect(Math.hypot(tEnd.x - shotB.x, tEnd.y - shotB.y, tEnd.z - shotB.z)).toBeLessThan(0.05);
    expect(evaluateSequence(plan, 11, ctx)!.inTransition).toBe(true);
  });
  it("samples at 10 Hz", () => {
    const s = sampleSequence(planSequence([shot("ascend", 5)]), ctx);
    expect(s).toHaveLength(51);
    expect(s[50]!.drone.z).toBeCloseTo(60, 6);
  });
  it("empty sequence", () => {
    expect(evaluateSequence(planSequence([]), 0, ctx)).toBeNull();
  });
});
