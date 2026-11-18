import { describe, expect, it } from "vitest";
import { migrateProject, ProjectMigrationError } from "./migrations";

const base = {
  id: "7b0c5d1e-2f4a-4c1b-9d7e-3a2b1c0d9e8f",
  name: "Crête du Brévent",
  createdAt: "2026-11-17T10:00:00.000Z",
  updatedAt: "2026-11-17T10:00:00.000Z",
};

describe("migrateProject", () => {
  it("migrates an unversioned document to the current version and fills defaults", () => {
    const p = migrateProject(base);
    expect(p.schemaVersion).toBe(2);
    expect(p.gpxTracks).toEqual([]);
    expect(p.scene).toEqual({});
    expect(p.waypoints).toEqual([]);
    expect(p.environment).toEqual({ kind: "none" });
    expect(p.droneProfileId).toBe("dji-neo-2");
  });

  it("migrates v1 → v2", () => {
    const p = migrateProject({ ...base, schemaVersion: 1, environment: { kind: "real", center: { lat: 45.9, lon: 6.87 } } });
    expect(p.schemaVersion).toBe(2);
    expect(p.environment.kind).toBe("real");
    expect(p.gpxTracks).toEqual([]);
  });

  it("accepts a valid v1 document", () => {
    expect(migrateProject({ ...base, schemaVersion: 1 }).name).toBe("Crête du Brévent");
  });

  it("rejects future versions", () => {
    expect(() => migrateProject({ ...base, schemaVersion: 99 })).toThrow(ProjectMigrationError);
  });

  it("rejects invalid payloads with a readable message", () => {
    expect(() => migrateProject({ ...base, schemaVersion: 2, name: "" })).toThrow(/name/);
    expect(() => migrateProject([])).toThrow(ProjectMigrationError);
    expect(() => migrateProject({ ...base, schemaVersion: "1" })).toThrow(/schemaVersion/);
  });

  it("rejects out-of-range coordinates", () => {
    expect(() =>
      migrateProject({ ...base, schemaVersion: 1, environment: { kind: "real", center: { lat: 95, lon: 6 } } }),
    ).toThrow();
  });
});
