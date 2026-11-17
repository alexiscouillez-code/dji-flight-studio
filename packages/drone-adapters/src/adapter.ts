import type { Capability } from "./capabilities";

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export interface Telemetry {
  timestamp: number;
  lat: number;
  lon: number;
  /** Height relative to take-off point, metres — as reported by the SDK. */
  takeoffRelativeHeightM: number;
  headingDeg: number;
  groundSpeedMs: number;
}

/**
 * Common contract for every drone integration (prompt §14).
 * Optional members exist ONLY when the hardware + official SDK really support them.
 * An adapter must never fake an implementation; callers check `capabilities` first.
 */
export interface DroneAdapter {
  readonly profileId: string;
  readonly capabilities: ReadonlySet<Capability>;
  connect?(): Promise<void>;
  disconnect?(): Promise<void>;
  getConnectionStatus?(): ConnectionStatus;
  getBatteryStatus?(): Promise<{ percent: number }>;
  getTelemetry?(): Promise<Telemetry>;
  getFlightMode?(): Promise<string>;
  startMission?(missionId: string): Promise<void>;
  pauseMission?(): Promise<void>;
  stopMission?(): Promise<void>;
}

/** Companion-only adapter: no link to the aircraft at all. Used for DJI Neo 2. */
export function createManualCompanionAdapter(profileId: string): DroneAdapter {
  return Object.freeze({
    profileId,
    capabilities: new Set<Capability>(["manual-companion"]),
  });
}
