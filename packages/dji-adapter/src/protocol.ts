import { z } from "zod";
import { CAPABILITIES } from "@dfs/drone-adapters";

/**
 * DFS Bridge protocol v1 — JSON messages between the web app and a native "bridge" app
 * (Android, DJI MSDK V5) running next to the remote controller. The web app never talks to
 * the aircraft directly: the bridge owns the official SDK and declares what it really supports.
 */
export const PROTOCOL = "dfs-bridge/1" as const;

const Capability = z.enum(CAPABILITIES);

export const HelloSchema = z.object({
  type: z.literal("hello"),
  protocol: z.literal(PROTOCOL),
  bridge: z.object({ name: z.string().max(80), version: z.string().max(40), platform: z.enum(["android", "ios", "desktop", "test"]) }),
  sdk: z.object({ name: z.string().max(60), version: z.string().max(40) }),
  aircraft: z.object({ model: z.string().max(80), profileId: z.string().max(60).optional(), firmware: z.string().max(60).optional() }).nullable(),
  capabilities: z.array(Capability).max(10),
  limits: z.object({ maxWaypoints: z.number().int().positive().optional(), maxSpeedMs: z.number().positive().optional(), maxHeightM: z.number().positive().optional() }).default({}),
  /** The bridge never takes off on its own: the pilot takes off manually before any mission. */
  requiresManualTakeoff: z.literal(true),
});
export type Hello = z.infer<typeof HelloSchema>;

export const TelemetrySchema = z.object({
  type: z.literal("telemetry"),
  timestamp: z.number(),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  takeoffRelativeHeightM: z.number(),
  headingDeg: z.number(),
  groundSpeedMs: z.number().min(0),
  batteryPercent: z.number().min(0).max(100).optional(),
  gpsSatellites: z.number().int().min(0).optional(),
  flightMode: z.string().max(40).optional(),
});
export type TelemetryMsg = z.infer<typeof TelemetrySchema>;

export const MissionStatusSchema = z.object({
  type: z.literal("mission-status"),
  state: z.enum(["idle", "uploading", "ready", "running", "paused", "finished", "aborted", "error"]),
  progress: z.number().min(0).max(1).optional(),
  message: z.string().max(300).optional(),
});
export type MissionStatus = z.infer<typeof MissionStatusSchema>;

export const BridgeErrorSchema = z.object({ type: z.literal("error"), code: z.string().max(40), message: z.string().max(300) });

export const IncomingSchema = z.discriminatedUnion("type", [HelloSchema, TelemetrySchema, MissionStatusSchema, BridgeErrorSchema]);
export type Incoming = z.infer<typeof IncomingSchema>;

export type Outgoing =
  | { type: "hello-ack"; protocol: typeof PROTOCOL; app: string }
  | { type: "subscribe-telemetry"; hz: number }
  | { type: "upload-mission"; mission: unknown }
  | { type: "start-mission" }
  | { type: "pause-mission" }
  | { type: "resume-mission" }
  | { type: "stop-mission" };

export function parseIncoming(raw: string): { ok: true; msg: Incoming } | { ok: false; error: string } {
  let json: unknown;
  try { json = JSON.parse(raw); } catch { return { ok: false, error: "Message non JSON" }; }
  const r = IncomingSchema.safeParse(json);
  if (!r.success) return { ok: false, error: r.error.issues[0]?.message ?? "Message invalide" };
  return { ok: true, msg: r.data };
}
