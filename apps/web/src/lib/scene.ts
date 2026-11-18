import type { LatLon, Project, ScenePoint } from "@dfs/shared-types";
import { createEnuFrame, haversineDistanceM } from "@dfs/geographic-engine";
import type { Vec3 } from "@dfs/trajectory-engine";
import type { GlobeHandle } from "@/components/globe/GlobeView";

/**
 * Scene frame shared by Flight Designer, Timeline and Simulator.
 * Origin = subject ground (or take-off if no subject). z = height above that ground point,
 * in metres along the local vertical. Geographic heights are WGS84 ellipsoidal (Cesium).
 */
export interface SceneFrame {
  origin: LatLon;
  originH: number;
  takeoff: Vec3;
  /** True when ground heights come from a terrain model (else everything sits on the ellipsoid). */
  hasTerrain: boolean;
  toGeo(p: Vec3): LatLon & { h: number };
  fromGeo(p: LatLon, h: number): Vec3;
  subjectTrack?: Vec3[];
  waypointPath: Vec3[];
  warnings: string[];
}

export function buildSceneFrame(project: Project): SceneFrame | null {
  const { takeoff, subject } = project.scene;
  const anchor = subject ?? takeoff;
  if (!anchor) return null;
  const warnings: string[] = [];
  const hS = subject?.terrain?.valueM, hT = takeoff?.terrain?.valueM;
  const originH = hS ?? hT ?? 0;
  const hasTerrain = hS !== undefined || hT !== undefined;
  if (!hasTerrain) warnings.push("Altitudes du sol inconnues (relief indisponible) : hauteurs calculées sur l'ellipsoïde.");
  if (!subject) warnings.push("Aucun sujet placé : le point de décollage sert de sujet.");
  if (!takeoff) warnings.push("Aucun point de décollage placé : les hauteurs « / décollage » sont relatives au sujet.");
  const enu = createEnuFrame(anchor.position, originH);
  const fromGeo = (p: LatLon, h: number): Vec3 => { const e = enu.toEnu(p, h); return { x: e.e, y: e.n, z: e.u }; };
  const toGeo = (p: Vec3) => enu.fromEnu({ e: p.x, n: p.y, u: p.z });
  const takeoffGround = hT ?? originH;
  const tk = takeoff ? fromGeo(takeoff.position, takeoffGround) : { x: 0, y: 0, z: 0 };

  // Subject track = first visible GPX track, from the point nearest to the subject onwards.
  let subjectTrack: Vec3[] | undefined;
  const track = project.gpxTracks.find((t) => t.visible) ?? project.gpxTracks[0];
  if (track && subject) {
    let k = 0, best = Infinity;
    track.points.forEach((p, i) => { const d = haversineDistanceM(p, subject.position); if (d < best) { best = d; k = i; } });
    if (best < 200) {
      const e0 = track.points[k]!.ele;
      subjectTrack = track.points.slice(k).map((p) => {
        const v = fromGeo(p, originH);
        return { x: v.x, y: v.y, z: e0 !== null && p.ele !== null ? p.ele - e0 : 0 };
      });
    } else warnings.push("Le sujet est à plus de 200 m du parcours GPX : les suivis partent en ligne droite.");
  }

  const waypointPath = project.waypoints
    .filter((w) => w.altitude.reference === "takeoff_relative")
    .map((w) => { const v = fromGeo(w.position, originH); return { x: v.x, y: v.y, z: tk.z + w.altitude.valueM }; });

  return { origin: anchor.position, originH, takeoff: tk, hasTerrain, toGeo, fromGeo, subjectTrack, waypointPath, warnings };
}

/** Samples terrain under a scene point and builds a ScenePoint (heights are WGS84 ellipsoidal). */
export async function makeScenePoint(globe: GlobeHandle | null, p: LatLon): Promise<ScenePoint> {
  try {
    const [h] = (await globe?.sampleTerrain([p])) ?? [null];
    if (h !== null && h !== undefined) return { position: p, terrain: { valueM: h, reference: "terrain_wgs84", source: "Cesium World Terrain" } };
  } catch { /* fall through */ }
  return { position: p };
}

/** Ground z (scene frame) under scene points, via the globe's terrain. Null where unknown. */
export async function groundUnder(globe: GlobeHandle | null, frame: SceneFrame, pts: Vec3[], maxSamples = 400): Promise<(number | null)[]> {
  if (!globe?.terrainAvailable() || !pts.length) return pts.map(() => null);
  const step = Math.max(1, Math.ceil(pts.length / maxSamples));
  const idx = pts.map((_, i) => i).filter((i) => i % step === 0 || i === pts.length - 1);
  const geo = idx.map((i) => frame.toGeo(pts[i]!));
  const h = await globe.sampleTerrain(geo);
  const zAt = new Map<number, number | null>();
  idx.forEach((i, k) => { const g = geo[k]!; zAt.set(i, h[k] === null || h[k] === undefined ? null : frame.fromGeo(g, h[k]!).z); });
  // linear interpolation between sampled indices
  return pts.map((_, i) => {
    if (zAt.has(i)) return zAt.get(i)!;
    const a = Math.floor(i / step) * step, b = Math.min(pts.length - 1, a + step);
    const za = zAt.get(a), zb = zAt.get(b);
    if (za === null || za === undefined || zb === null || zb === undefined) return null;
    return za + (zb - za) * ((i - a) / (b - a));
  });
}
