import type { Vec3 } from "@dfs/trajectory-engine";

export interface PlannedSample { t: number; drone: Vec3; camera: { headingDeg: number; pitchDeg: number } }

export interface MissionWaypoint {
  lat: number;
  lon: number;
  /** Height relative to the take-off point (m). */
  heightM: number;
  /** WGS84 ellipsoidal height (m) — for map exports. */
  ellipsoidHeightM: number;
  speedMs: number;
  headingDeg: number;
  gimbalPitchDeg: number;
  timeS: number;
}

export interface MissionIssue { level: "warning" | "technical-block"; message: string }

export interface DfsMission {
  format: "dfs-mission/1";
  generatedAt: string;
  projectId: string;
  profileId: string;
  altitudeReference: "takeoff_relative";
  /** Always true: the pilot takes off manually; the mission starts in the air. */
  manualTakeoff: true;
  waypoints: MissionWaypoint[];
  issues: MissionIssue[];
  blocked: boolean;
}

export interface CompileOptions {
  projectId: string;
  profileId: string;
  toGeo(p: Vec3): { lat: number; lon: number; h: number };
  takeoffZ: number;
  /** Keep one waypoint every N seconds (plus direction changes). */
  intervalS?: number;
  maxWaypoints?: number;
  maxHeightM?: number;
  minHeightM?: number;
  maxSpeedMs?: number;
  now?: () => string;
}

const ang = (a: number, b: number) => Math.abs(((((b - a) % 360) + 540) % 360) - 180);

/**
 * Converts the simulated sequence into a waypoint list for a bridge. Validation is strict:
 * anything outside the configured limits blocks the upload (it is never silently clamped).
 */
export function compileMission(samples: PlannedSample[], o: CompileOptions): DfsMission {
  const interval = o.intervalS ?? 2;
  const maxWp = o.maxWaypoints ?? 200;
  const maxH = o.maxHeightM ?? 120, minH = o.minHeightM ?? 2, maxV = o.maxSpeedMs ?? 10;
  const issues: MissionIssue[] = [];
  const keep: number[] = [];
  let lastT = -Infinity;
  samples.forEach((s, i) => {
    const prev = keep.length ? samples[keep[keep.length - 1]!]! : null;
    const turn = prev ? ang(prev.camera.headingDeg, s.camera.headingDeg) > 25 : false;
    if (i === 0 || i === samples.length - 1 || s.t - lastT >= interval - 1e-9 || turn) { keep.push(i); lastT = s.t; }
  });
  const wps: MissionWaypoint[] = keep.map((i, k) => {
    const s = samples[i]!, g = o.toGeo(s.drone);
    const next = samples[keep[k + 1] ?? i]!;
    const dt = next.t - s.t;
    const d = Math.hypot(next.drone.x - s.drone.x, next.drone.y - s.drone.y, next.drone.z - s.drone.z);
    return {
      lat: g.lat, lon: g.lon, heightM: s.drone.z - o.takeoffZ, ellipsoidHeightM: g.h,
      speedMs: dt > 0 ? d / dt : 0, headingDeg: ((s.camera.headingDeg % 360) + 360) % 360,
      gimbalPitchDeg: Math.max(-90, Math.min(30, s.camera.pitchDeg)), timeS: s.t,
    };
  });
  if (wps.length < 2) issues.push({ level: "technical-block", message: "Séquence trop courte : moins de 2 waypoints." });
  if (wps.length > maxWp) issues.push({ level: "technical-block", message: `${wps.length} waypoints > limite ${maxWp} du pont / appareil. Augmentez l'intervalle ou raccourcissez le plan.` });
  const hi = Math.max(...wps.map((w) => w.heightM)), lo = Math.min(...wps.map((w) => w.heightM)), vmax = Math.max(0, ...wps.map((w) => w.speedMs));
  if (hi > maxH) issues.push({ level: "technical-block", message: `Hauteur ${hi.toFixed(0)} m > limite ${maxH} m.` });
  if (lo < minH) issues.push({ level: "technical-block", message: `Hauteur ${lo.toFixed(1)} m < minimum ${minH} m au-dessus du décollage.` });
  if (vmax > maxV) issues.push({ level: "technical-block", message: `Vitesse ${vmax.toFixed(1)} m/s > limite ${maxV} m/s.` });
  issues.push({ level: "warning", message: "Les obstacles (arbres, câbles, bâtiments) ne sont pas pris en compte : supervision visuelle permanente obligatoire." });
  return {
    format: "dfs-mission/1", generatedAt: (o.now ?? (() => new Date().toISOString()))(), projectId: o.projectId, profileId: o.profileId,
    altitudeReference: "takeoff_relative", manualTakeoff: true, waypoints: wps, issues, blocked: issues.some((i) => i.level === "technical-block"),
  };
}

const esc = (s: string) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);

/** GPX route. <ele> is omitted on purpose: GPX elevation semantics differ from take-off-relative heights. */
export function missionToGpx(m: DfsMission, name: string): string {
  const pts = m.waypoints.map((w, i) => `    <rtept lat="${w.lat.toFixed(7)}" lon="${w.lon.toFixed(7)}"><name>WP${i + 1}</name><desc>H ${w.heightM.toFixed(1)} m / décollage · ${w.speedMs.toFixed(1)} m/s · cap ${w.headingDeg.toFixed(0)}° · nacelle ${w.gimbalPitchDeg.toFixed(0)}° · t ${w.timeS.toFixed(1)} s</desc></rtept>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="DJI FLIGHT STUDIO" xmlns="http://www.topografix.com/GPX/1/1">\n  <rte>\n    <name>${esc(name)}</name>\n    <desc>Trajectoire simulée — hauteurs relatives au décollage dans desc. Pas une autorisation de vol.</desc>\n${pts}\n  </rte>\n</gpx>\n`;
}

/** GeoJSON: LineString with WGS84 ellipsoidal heights + one Point per waypoint with flight properties. */
export function missionToGeoJson(m: DfsMission, name: string) {
  return {
    type: "FeatureCollection",
    properties: { name, format: m.format, generatedAt: m.generatedAt, heightReference: "coordinates[2] = WGS84 ellipsoid; properties.heightTakeoffM = relative to take-off" },
    features: [
      { type: "Feature", properties: { name, kind: "trajectory" }, geometry: { type: "LineString", coordinates: m.waypoints.map((w) => [w.lon, w.lat, Number(w.ellipsoidHeightM.toFixed(2))]) } },
      ...m.waypoints.map((w, i) => ({
        type: "Feature",
        properties: { kind: "waypoint", index: i + 1, heightTakeoffM: Number(w.heightM.toFixed(2)), speedMs: Number(w.speedMs.toFixed(2)), headingDeg: Number(w.headingDeg.toFixed(1)), gimbalPitchDeg: Number(w.gimbalPitchDeg.toFixed(1)), timeS: w.timeS },
        geometry: { type: "Point", coordinates: [w.lon, w.lat, Number(w.ellipsoidHeightM.toFixed(2))] },
      })),
    ],
  };
}
