import { describe, expect, it } from "vitest";
import { migrateProject } from "@dfs/shared-types";
import { evaluateMission, isBlocking } from "./safety";

const proj = (extra: object = {}) => migrateProject({
  schemaVersion: 2, id: "7b0c5d1e-2f4a-4c1b-9d7e-3a2b1c0d9e8f", name: "t",
  createdAt: "2026-11-17T10:00:00.000Z", updatedAt: "2026-11-17T10:00:00.000Z", ...extra,
});
const w = (alt: number, i = 1) => ({
  id: `00000000-0000-4000-8000-00000000000${i}`, position: { lat: 45, lon: 6 },
  altitude: { valueM: alt, reference: "takeoff_relative", source: "user" },
});

describe("evaluateMission", () => {
  it("always requires human validation and never blocks a valid Neo 2 project", () => {
    const c = evaluateMission(proj());
    expect(c.some((x) => x.id === "pilot" && x.level === "human-validation")).toBe(true);
    expect(isBlocking(c)).toBe(false);
  });
  it("blocks unknown drones", () => {
    expect(isBlocking(evaluateMission(proj({ droneProfileId: "dji-x" })))).toBe(true);
  });
  it("warns above 120 m and above Neo 2 app-control limit", () => {
    const ids = evaluateMission(proj({ waypoints: [w(30, 1), w(130, 2)] })).map((c) => c.id);
    expect(ids).toContain("height-120");
    expect(ids).toContain("limit-60");
  });
  it("warns on long distance", () => {
    expect(evaluateMission(proj(), { maxDistanceFromTakeoffM: 900 }).map((c) => c.id)).toContain("vlos");
  });
});
