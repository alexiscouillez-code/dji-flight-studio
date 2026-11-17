import { z } from "zod";
import { AltitudeSchema, LatLonSchema } from "./geo";

export const CURRENT_PROJECT_SCHEMA_VERSION = 1 as const;

export const InterpolationSchema = z.enum(["linear", "catmull-rom"]);

export const WaypointSchema = z.object({
  id: z.string().uuid(),
  position: LatLonSchema,
  altitude: AltitudeSchema,
  /** Drone heading, degrees clockwise from true north [0,360). */
  headingDeg: z.number().min(0).lt(360).optional(),
  /** Gimbal pitch, degrees; 0 = horizon, -90 = straight down. */
  gimbalPitchDeg: z.number().min(-90).max(30).optional(),
  /** Planned speed when leaving this waypoint (m/s, simulation only). */
  speedMs: z.number().positive().max(30).optional(),
  pauseS: z.number().min(0).max(600).default(0),
  /** Camera behaviour, e.g. look at subject. */
  cameraMode: z.enum(["free", "look-at-subject", "fixed-heading"]).default("free"),
  label: z.string().max(80).optional(),
});
export type Waypoint = z.infer<typeof WaypointSchema>;

export const EnvironmentSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("real"),
    center: LatLonSchema,
    label: z.string().max(200).optional(),
  }),
  z.object({
    kind: z.literal("virtual"),
    preset: z.enum(["studio", "valley", "test-mountain", "forest", "sim-ground"]),
  }),
  z.object({ kind: z.literal("none") }),
]);
export type Environment = z.infer<typeof EnvironmentSchema>;

export const HistoryEntrySchema = z.object({
  at: z.string().datetime(),
  action: z.string().max(120),
});

export const ProjectSchema = z.object({
  schemaVersion: z.literal(CURRENT_PROJECT_SCHEMA_VERSION),
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000).default(""),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  archived: z.boolean().default(false),
  environment: EnvironmentSchema.default({ kind: "none" }),
  droneProfileId: z.string().min(1).default("dji-neo-2"),
  gpxTrackIds: z.array(z.string()).default([]),
  waypoints: z.array(WaypointSchema).default([]),
  interpolation: InterpolationSchema.default("catmull-rom"),
  /** Reserved for Phase 3 engines; kept opaque but validated as JSON objects. */
  cinematicMoves: z.array(z.record(z.unknown())).default([]),
  camera: z.record(z.unknown()).default({}),
  timeline: z.array(z.record(z.unknown())).default([]),
  simulation: z.record(z.unknown()).default({}),
  history: z.array(HistoryEntrySchema).max(500).default([]),
});
export type Project = z.infer<typeof ProjectSchema>;

export const PROJECT_EXPORT_FORMAT = "dji-flight-studio.project" as const;

export const ProjectExportSchema = z.object({
  format: z.literal(PROJECT_EXPORT_FORMAT),
  schemaVersion: z.number().int().positive(),
  exportedAt: z.string().datetime(),
  project: z.unknown(),
});
