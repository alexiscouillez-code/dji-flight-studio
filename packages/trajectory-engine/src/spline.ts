export interface Vec3 { x: number; y: number; z: number }

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const dist3 = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/**
 * Centripetal Catmull-Rom (α = 0.5) between p1 and p2. Centripetal parameterisation
 * avoids cusps and self-intersections, which matters for camera paths.
 * Passes exactly through every control point.
 */
export function catmullRomPoint(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, u: number): Vec3 {
  const alpha = 0.5;
  const tj = (ti: number, a: Vec3, b: Vec3) => ti + Math.max(Math.pow(dist3(a, b), alpha), 1e-6);
  const t0 = 0;
  const t1 = tj(t0, p0, p1);
  const t2 = tj(t1, p1, p2);
  const t3 = tj(t2, p2, p3);
  const t = t1 + (t2 - t1) * u;
  const lerp = (a: Vec3, b: Vec3, ta: number, tb: number): Vec3 => {
    const w = (t - ta) / (tb - ta);
    return { x: a.x + (b.x - a.x) * w, y: a.y + (b.y - a.y) * w, z: a.z + (b.z - a.z) * w };
  };
  const A1 = lerp(p0, p1, t0, t1);
  const A2 = lerp(p1, p2, t1, t2);
  const A3 = lerp(p2, p3, t2, t3);
  const B1 = lerp(A1, A2, t0, t2);
  const B2 = lerp(A2, A3, t1, t3);
  return lerp(B1, B2, t1, t2);
}

/** Samples a path through all control points. Returns per-segment polylines. */
export function samplePath(points: Vec3[], mode: "linear" | "catmull-rom", samplesPerSegment = 24): Vec3[][] {
  if (points.length < 2) return [];
  const segs: Vec3[][] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    if (mode === "linear") { segs.push([p1, p2]); continue; }
    // Phantom end points by reflection keep the curve natural at the ends.
    const p0 = points[i - 1] ?? reflect(p1, p2);
    const p3 = points[i + 2] ?? reflect(p2, p1);
    const seg: Vec3[] = [];
    for (let s = 0; s <= samplesPerSegment; s++) seg.push(catmullRomPoint(p0, p1, p2, p3, s / samplesPerSegment));
    segs.push(seg);
  }
  return segs;
}

function reflect(p: Vec3, q: Vec3): Vec3 {
  const d = sub(p, q);
  return { x: p.x + d.x, y: p.y + d.y, z: p.z + d.z };
}

export const polylineLength = (pts: Vec3[]) => pts.reduce((acc, p, i) => (i ? acc + dist3(pts[i - 1]!, p) : 0), 0);
