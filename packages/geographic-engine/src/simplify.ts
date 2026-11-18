import { createEnuFrame } from "./geodesy";

export interface SimplifiablePoint { lat: number; lon: number; ele: number | null }

/**
 * Douglas-Peucker simplification in a local metric frame (horizontal only).
 * Increases tolerance until the result fits `maxPoints`. Start/end are always kept.
 * Used to store GPX tracks compactly; statistics must be computed on the original points.
 */
export function simplifyTrack<T extends SimplifiablePoint>(points: T[], opts: { toleranceM?: number; maxPoints?: number } = {}): T[] {
  const maxPoints = opts.maxPoints ?? 5000;
  if (points.length <= 2) return points.slice();
  const frame = createEnuFrame(points[0]!, 0);
  const all = points.map((p) => { const v = frame.toEnu(p, 0); return [v.e, v.n] as const; });
  // Radial pre-filter keeps Douglas-Peucker fast (it is O(n²) on noisy zig-zag tracks).
  let idx = all.map((_, i) => i);
  if (points.length > 4 * maxPoints) {
    let total = 0;
    for (let i = 1; i < all.length; i++) total += Math.hypot(all[i]![0] - all[i - 1]![0], all[i]![1] - all[i - 1]![1]);
    const step = total / (4 * maxPoints);
    idx = [0];
    let last = all[0]!;
    for (let i = 1; i < all.length - 1; i++) {
      const p = all[i]!;
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) >= step) { idx.push(i); last = p; }
    }
    idx.push(all.length - 1);
  }
  const xy = idx.map((i) => all[i]!);
  let tol = opts.toleranceM ?? 2;
  for (let iter = 0; iter < 30; iter++) {
    const keep = douglasPeucker(xy, tol);
    if (keep.length <= maxPoints) return keep.map((k) => points[idx[k]!]!);
    tol *= 1.6;
  }
  // Pathological input: fall back to uniform decimation.
  const step = Math.ceil(points.length / maxPoints);
  const out = points.filter((_, i) => i % step === 0);
  if (out[out.length - 1] !== points[points.length - 1]) out.push(points[points.length - 1]!);
  return out.slice(0, maxPoints);
}

function douglasPeucker(xy: ReadonlyArray<readonly [number, number]>, tol: number): number[] {
  const keep = new Uint8Array(xy.length);
  keep[0] = 1; keep[xy.length - 1] = 1;
  const stack: [number, number][] = [[0, xy.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let maxD = 0, idx = -1;
    const [ax, ay] = xy[a]!, [bx, by] = xy[b]!;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = xy[i]!;
      let d: number;
      if (len2 === 0) d = Math.hypot(px - ax, py - ay);
      else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
        d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      }
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (idx >= 0 && maxD > tol) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  const out: number[] = [];
  keep.forEach((k, i) => { if (k) out.push(i); });
  return out;
}

/** Evenly spaced sample points along a polyline (by distance), for DEM profile sampling. */
export function resampleByDistance<T extends SimplifiablePoint>(points: T[], count: number): { lat: number; lon: number; distanceM: number }[] {
  if (points.length < 2 || count < 2) return [];
  const frame = createEnuFrame(points[0]!, 0);
  const xy = points.map((p) => frame.toEnu(p, 0));
  const cum = [0];
  for (let i = 1; i < xy.length; i++) cum.push(cum[i - 1]! + Math.hypot(xy[i]!.e - xy[i - 1]!.e, xy[i]!.n - xy[i - 1]!.n));
  const total = cum[cum.length - 1]!;
  const out: { lat: number; lon: number; distanceM: number }[] = [];
  let j = 0;
  for (let k = 0; k < count; k++) {
    const d = (total * k) / (count - 1);
    while (j < cum.length - 2 && cum[j + 1]! < d) j++;
    const seg = cum[j + 1]! - cum[j]!;
    const t = seg > 0 ? (d - cum[j]!) / seg : 0;
    const p = frame.fromEnu({ e: xy[j]!.e + (xy[j + 1]!.e - xy[j]!.e) * t, n: xy[j]!.n + (xy[j + 1]!.n - xy[j]!.n) * t, u: 0 });
    out.push({ lat: p.lat, lon: p.lon, distanceM: d });
  }
  return out;
}
