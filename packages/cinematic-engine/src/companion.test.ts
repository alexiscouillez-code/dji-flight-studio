import { describe, expect, it } from "vitest";
import type { Shot } from "@dfs/shared-types";
import { buildCompanionGuide, compassLabel, defaultParams, guideToMarkdown, planSequence, sampleSequence } from "./index";

const shot = (moveId: string, durationS: number, params = {}, transitionS = 0): Shot => ({ id: crypto.randomUUID(), moveId, durationS, transitionS, params: { ...defaultParams(moveId), ...params } });
const ctx = { subjectHeightM: 1.7 };
const build = (shots: Shot[], takeoffZ = 0) => {
  const plan = planSequence(shots);
  return buildCompanionGuide(plan, sampleSequence(plan, ctx), { takeoff: { x: 0, y: -50, z: takeoffZ }, takeoffZ });
};

describe("companion guide", () => {
  it("compass labels", () => {
    expect(compassLabel(0)).toBe("nord");
    expect(compassLabel(200)).toBe("sud-sud-ouest");
    expect(compassLabel(359)).toBe("nord");
  });
  it("orbit partial: start/end cues, clockwise sweep, stick cues and DJI Fly Circle hint", () => {
    const g = build([shot("orbit-partial", 10, { radius: 25, height: 12, bearing: 200, sweep: 120, direction: "cw" })]);
    const s = g.steps[0]!;
    expect(s.start.distanceToSubjectM).toBeCloseTo(25, 3);
    expect(s.start.heightTakeoffM).toBeCloseTo(12, 6);
    expect(s.start.bearingLabel).toBe("sud-sud-ouest");
    expect(s.end.bearingFromSubjectDeg).toBeCloseTo(320, 0);
    expect(s.orbitSweepDeg).toBeCloseTo(120, 0);
    expect(s.sticks.join(" ")).toMatch(/Orbite horaire de 120°.*gauche.*droite/);
    expect(s.nativeMode?.name).toBe("Circle");
  });
  it("take-off relative heights use the take-off z", () => {
    const g = build([shot("ascend", 10, { heightStart: 2, heightEnd: 60 })], 15);
    expect(g.steps[0]!.start.heightTakeoffM).toBeCloseTo(-13, 6);
    expect(g.steps[0]!.end.heightTakeoffM).toBeCloseTo(45, 6);
    expect(g.steps[0]!.sticks.join(" ")).toMatch(/Monter de 58 m/);
  });
  it("pull out tells to fly backwards, warns above 60 m (Neo 2 smartphone limit)", () => {
    const g = build([shot("pull-out", 12, { heightEnd: 70 })]);
    expect(g.steps[0]!.sticks.join(" ")).toMatch(/Reculer/);
    expect(g.warnings.join(" ")).toMatch(/60 m/);
  });
  it("markdown export contains every step and the disclaimer", () => {
    const g = build([shot("reveal", 10), shot("pull-out", 8, {}, 2)]);
    const md = guideToMarkdown("Test", g);
    expect(md).toMatch(/## 1\. Reveal/);
    expect(md).toMatch(/## 2\. Pull Out — 8 s \(après 2 s de transition\)/);
    expect(md).toMatch(/pas des commandes de vol/);
  });
});
