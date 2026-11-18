import type { Vec3 } from "@dfs/trajectory-engine";

export const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
export const add = (a: Vec3, b: Vec3): Vec3 => v(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a: Vec3, b: Vec3): Vec3 => v(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (a: Vec3, k: number): Vec3 => v(a.x * k, a.y * k, a.z * k);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const lerpV = (a: Vec3, b: Vec3, t: number): Vec3 => v(lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t));
export const len = (a: Vec3) => Math.hypot(a.x, a.y, a.z);
export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Horizontal offset at `r` metres on bearing `b` (deg, clockwise from north). x = east, y = north. */
export const polar = (r: number, bearingDeg: number, z = 0): Vec3 => v(r * Math.sin(rad(bearingDeg)), r * Math.cos(rad(bearingDeg)), z);
export const bearingOf = (d: Vec3) => (deg(Math.atan2(d.x, d.y)) + 360) % 360;

/** Ease in/out whose strength is set by `intensity` ∈ [0,1] (0 = linear, 1 = smootherstep). */
export function ease(t: number, intensity: number) {
  const u = clamp(t, 0, 1);
  const s = u * u * u * (u * (u * 6 - 15) + 10);
  return lerp(u, s, clamp(intensity, 0, 1));
}

/** Camera heading/pitch (deg) looking from `from` to `to`. Heading clockwise from north, pitch negative = down. */
export function lookAngles(from: Vec3, to: Vec3): { headingDeg: number; pitchDeg: number } {
  const d = sub(to, from);
  const h = Math.hypot(d.x, d.y);
  return { headingDeg: bearingOf(d), pitchDeg: h < 1e-6 && Math.abs(d.z) < 1e-6 ? 0 : deg(Math.atan2(d.z, h)) };
}

/** Shortest-path interpolation of headings (deg). */
export function lerpHeading(a: number, b: number, t: number) {
  const d = ((((b - a) % 360) + 540) % 360) - 180;
  return (a + d * t + 360) % 360;
}

/** Position at distance `s` along a polyline (clamped), plus the local travel bearing. */
export function alongPolyline(pts: Vec3[], s: number): { p: Vec3; bearingDeg: number } {
  if (pts.length === 0) return { p: v(0, 0, 0), bearingDeg: 0 };
  if (pts.length === 1) return { p: pts[0]!, bearingDeg: 0 };
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!, b = pts[i]!;
    const seg = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    if (acc + seg >= s || i === pts.length - 1) {
      const t = seg > 0 ? clamp((s - acc) / seg, 0, 1) : 0;
      return { p: lerpV(a, b, t), bearingDeg: bearingOf(sub(b, a)) };
    }
    acc += seg;
  }
  return { p: pts[pts.length - 1]!, bearingDeg: 0 };
}
