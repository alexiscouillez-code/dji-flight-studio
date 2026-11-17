export const CAPABILITIES = [
  "telemetry",
  "camera",
  "gimbal",
  "mission",
  "waypoint",
  "manual-companion",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export const CAPABILITY_LABELS: Record<Capability, string> = {
  telemetry: "Telemetry Support",
  camera: "Camera Support",
  gimbal: "Gimbal Support",
  mission: "Mission Support",
  waypoint: "Waypoint Support",
  "manual-companion": "Manual Companion Support",
};

export type SupportStatus =
  | { status: "supported"; via: string }
  | { status: "not-supported"; reason: string; manualWorkflow?: string }
  | { status: "unverified"; reason: string };
