import type { Vec3 } from "@dfs/trajectory-engine";
import { MOVES_BY_ID, defaultParams, type Params, type ShotContext } from "./moves";

/**
 * Engine-computed preview of a move for the library cards: top view (x/y) and side view (distance/z)
 * normalised to a 0..1 box. Generated from the same sample() used by the simulator, so the
 * preview is exactly the trajectory that will be planned.
 */
export interface MovePreview {
  top: { x: number; y: number }[];
  side: { x: number; y: number }[];
  subjectTop: { x: number; y: number }[];
}

const STRAIGHT_TRACK: Vec3[] = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 400, z: 0 }];

export function previewMove(moveId: string, params?: Params, samples = 80): MovePreview | null {
  const m = MOVES_BY_ID[moveId];
  if (!m) return null;
  const p = { ...defaultParams(moveId), ...params, __durationS: m.defaultDurationS };
  const ctx: ShotContext = {
    subjectTrack: m.movingSubject ? STRAIGHT_TRACK : undefined,
    customPath: [{ x: -40, y: -30, z: 10 }, { x: 0, y: 20, z: 25 }, { x: 40, y: -10, z: 15 }, { x: 60, y: 40, z: 30 }],
  };
  const pts = Array.from({ length: samples }, (_, i) => m.sample(i / (samples - 1), p, ctx));
  const xs = [...pts.map((s) => s.drone.x), ...pts.map((s) => s.subject.x)];
  const ys = [...pts.map((s) => s.drone.y), ...pts.map((s) => s.subject.y)];
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1);
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  const norm = (x: number, y: number) => ({ x: 0.5 + (x - cx) / (span * 1.15), y: 0.5 - (y - cy) / (span * 1.15) });
  const horiz = pts.map((s) => Math.hypot(s.drone.x - s.subject.x, s.drone.y - s.subject.y));
  const maxH = Math.max(...horiz, 1), maxZ = Math.max(...pts.map((s) => s.drone.z), 1);
  return {
    top: pts.map((s) => norm(s.drone.x, s.drone.y)),
    subjectTop: pts.map((s) => norm(s.subject.x, s.subject.y)),
    side: pts.map((s, i) => ({ x: 0.08 + 0.84 * (horiz[i]! / maxH), y: 0.92 - 0.84 * (s.drone.z / maxZ) })),
  };
}
