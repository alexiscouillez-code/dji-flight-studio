import type { AltitudeReference, Waypoint } from "@dfs/shared-types";
import { createEnuFrame } from "@dfs/geographic-engine";
import { polylineLength, samplePath, type Vec3 } from "./spline";
import { trapezoidDuration } from "./motion";

export interface TrajectoryOptions {
  interpolation: "linear" | "catmull-rom";
  /** Default cruise speed when a waypoint has none (m/s). */
  defaultSpeedMs: number;
  /** Max horizontal/vertical acceleration of the *simulation* (m/s²). */
  accelMs2: number;
}

export const DEFAULT_TRAJECTORY_OPTIONS: TrajectoryOptions = {
  interpolation: "catmull-rom",
  defaultSpeedMs: 5,
  accelMs2: 2,
};

export interface SegmentStats {
  fromId: string;
  toId: string;
  lengthM: number;
  durationS: number;
  peakSpeedMs: number;
}

export interface TrajectoryStats {
  /** Always true: every figure here is a simulation estimate (prompt §9). */
  isSimulation: true;
  altitudeReference: AltitudeReference | null;
  totalDistanceM: number;
  estimatedDurationS: number;
  averageSpeedMs: number;
  maxSimulatedSpeedMs: number;
  minAltitudeM: number | null;
  maxAltitudeM: number | null;
  segments: SegmentStats[];
  /** Sampled path in local ENU metres (origin = first waypoint, u = altitude in the waypoints' reference). */
  path: Vec3[];
}

export class TrajectoryError extends Error {}

export function computeTrajectory(waypoints: Waypoint[], opts: Partial<TrajectoryOptions> = {}): TrajectoryStats {
  const o = { ...DEFAULT_TRAJECTORY_OPTIONS, ...opts };
  const empty: TrajectoryStats = {
    isSimulation: true, altitudeReference: null, totalDistanceM: 0, estimatedDurationS: 0,
    averageSpeedMs: 0, maxSimulatedSpeedMs: 0, minAltitudeM: null, maxAltitudeM: null, segments: [], path: [],
  };
  if (waypoints.length === 0) return empty;

  const ref = waypoints[0]!.altitude.reference;
  if (waypoints.some((w) => w.altitude.reference !== ref)) {
    throw new TrajectoryError("Les waypoints utilisent des référentiels d'altitude différents : conversion explicite requise.");
  }

  const origin = waypoints[0]!.position;
  const frame = createEnuFrame(origin, 0);
  // Horizontal positions from the ENU frame at h=0, vertical from the waypoint altitude.
  const pts: Vec3[] = waypoints.map((w) => {
    const enu = frame.toEnu(w.position, 0);
    return { x: enu.e, y: enu.n, z: w.altitude.valueM };
  });
  const alts = waypoints.map((w) => w.altitude.valueM);
  const base = { ...empty, altitudeReference: ref, minAltitudeM: Math.min(...alts), maxAltitudeM: Math.max(...alts) };
  if (waypoints.length === 1) return { ...base, path: pts };

  const segPolylines = samplePath(pts, o.interpolation);
  const segments: SegmentStats[] = segPolylines.map((poly, i) => {
    const from = waypoints[i]!;
    const lengthM = polylineLength(poly);
    const { durationS, peakMs } = trapezoidDuration(lengthM, from.speedMs ?? o.defaultSpeedMs, o.accelMs2);
    return { fromId: from.id, toId: waypoints[i + 1]!.id, lengthM, durationS, peakSpeedMs: peakMs };
  });

  const pauses = waypoints.reduce((a, w) => a + (w.pauseS ?? 0), 0);
  const totalDistanceM = segments.reduce((a, s) => a + s.lengthM, 0);
  const moving = segments.reduce((a, s) => a + s.durationS, 0);
  const estimatedDurationS = moving + pauses;
  const path = segPolylines.flatMap((p, i) => (i === 0 ? p : p.slice(1)));
  // Spline overshoot can exceed control-point altitudes — report the sampled extremes.
  const zs = path.map((p) => p.z);

  return {
    ...base,
    totalDistanceM,
    estimatedDurationS,
    averageSpeedMs: estimatedDurationS > 0 ? totalDistanceM / estimatedDurationS : 0,
    maxSimulatedSpeedMs: Math.max(0, ...segments.map((s) => s.peakSpeedMs)),
    minAltitudeM: Math.min(...zs),
    maxAltitudeM: Math.max(...zs),
    segments,
    path,
  };
}
