import { z } from "zod";
import { AltitudeSchema, LatLonSchema } from "./geo";

export const CURRENT_PROJECT_SCHEMA_VERSION = 3 as const;

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

/** A GPX track stored inside the project (simplified geometry, original stats). */
export const TrackPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  /** Elevation from the GPX file (metres, device-dependent reference), null when missing. */
  ele: z.number().finite().nullable(),
});
export const ProjectTrackSchema = z.object({
  id: z.string().uuid(),
  name: z.string().max(200),
  sourceFile: z.string().max(260),
  importedAt: z.string().datetime(),
  /** Simplified for storage; stats below are computed on the original file. */
  points: z.array(TrackPointSchema).min(2).max(5000),
  originalPointCount: z.number().int().min(2),
  distanceM: z.number().min(0),
  ascentM: z.number().min(0).nullable(),
  descentM: z.number().min(0).nullable(),
  visible: z.boolean().default(true),
});
export type ProjectTrack = z.infer<typeof ProjectTrackSchema>;

export const ScenePointSchema = z.object({
  position: LatLonSchema,
  /** Terrain elevation sampled at placement time, with its source (never mixed with drone heights). */
  terrain: AltitudeSchema.optional(),
});
export type ScenePoint = z.infer<typeof ScenePointSchema>;

export const CameraViewSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  heightM: z.number().min(1).max(5e7),
  headingDeg: z.number(),
  pitchDeg: z.number().min(-90).max(90),
});
export type CameraView = z.infer<typeof CameraViewSchema>;

export const SceneSchema = z.object({
  takeoff: ScenePointSchema.optional(),
  subject: ScenePointSchema.optional(),
  view: CameraViewSchema.optional(),
});
export type Scene = z.infer<typeof SceneSchema>;

/** One shot of the cinematic timeline: a move from the library + its parameters (regenerated deterministically). */
export const ShotSchema = z.object({
  id: z.string().uuid(),
  moveId: z.string().min(1).max(40),
  label: z.string().max(80).optional(),
  durationS: z.number().min(1).max(600),
  /** Blend from the previous shot (s); 0 = hard cut in trajectory. */
  transitionS: z.number().min(0).max(30).default(2),
  params: z.record(z.union([z.number(), z.string(), z.boolean()])).default({}),
});
export type Shot = z.infer<typeof ShotSchema>;

export const CameraModeSchema = z.enum(["drone", "free", "subject", "cinematic", "first-person"]);
export type CameraMode = z.infer<typeof CameraModeSchema>;

export const CameraSettingsSchema = z.object({
  mode: CameraModeSchema.default("drone"),
  /** Horizontal field of view used for the preview (deg). Set it to your camera's value. */
  fovDeg: z.number().min(20).max(140).default(80),
  /** Height of the look-at point above the subject's ground (m). */
  subjectHeightM: z.number().min(0).max(10).default(1.7),
  letterbox: z.boolean().default(true),
});
export type CameraSettings = z.infer<typeof CameraSettingsSchema>;

export const SimulationSettingsSchema = z.object({
  /** "ideal" follows the planned path exactly; "inertia" applies acceleration limits. */
  mode: z.enum(["ideal", "inertia"]).default("ideal"),
  maxSpeedMs: z.number().min(1).max(30).default(8),
  maxAccelMs2: z.number().min(0.5).max(20).default(3),
  /** Minimum clearance above the terrain model before warning (m). */
  minClearanceM: z.number().min(0).max(100).default(10),
});
export type SimulationSettings = z.infer<typeof SimulationSettingsSchema>;

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
  gpxTracks: z.array(ProjectTrackSchema).max(10).default([]),
  scene: SceneSchema.default({}),
  waypoints: z.array(WaypointSchema).default([]),
  interpolation: InterpolationSchema.default("catmull-rom"),
  /** Reserved for Phase 3 engines; kept opaque but validated as JSON objects. */
  cinematicMoves: z.array(z.record(z.unknown())).default([]),
  camera: CameraSettingsSchema.default({}),
  timeline: z.array(ShotSchema).max(50).default([]),
  simulation: SimulationSettingsSchema.default({}),
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
