import type { Vec3 } from "@dfs/trajectory-engine";
import type { SimPoint } from "./simulate";

export interface AnalysisInput {
  sim: SimPoint[];
  /** Terrain height under each sim point in the same frame (null = unknown). Same length as sim, or empty. */
  groundZ: (number | null)[];
  /** z of the take-off point in the scene frame (to report take-off-relative heights). */
  takeoffZ: number;
  takeoff: Vec3;
  subjectAt: (t: number) => Vec3;
  maxSpeedMs: number;
  maxAccelMs2: number;
  minClearanceM: number;
}

export interface Issue { level: "warning" | "technical-block"; code: string; message: string; atS: number }

export interface Analysis {
  isSimulation: true;
  durationS: number;
  distanceM: number;
  maxSpeedMs: number;
  avgSpeedMs: number;
  maxAccelMs2: number;
  /** Heights relative to the take-off point (DJI Fly "H"). */
  minHeightTakeoffM: number;
  maxHeightTakeoffM: number;
  /** Lowest clearance above the terrain model; null when no terrain data. */
  minClearanceM: number | null;
  maxDistanceFromTakeoffM: number;
  minDistanceToSubjectM: number;
  maxTrackingErrorM: number;
  issues: Issue[];
}

const d3 = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const d2 = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y);

export function analyze(i: AnalysisInput): Analysis {
  const { sim } = i;
  const issues: Issue[] = [];
  let dist = 0, maxSpeed = 0, maxAcc = 0, minH = Infinity, maxH = -Infinity, minClr: number | null = null, maxFar = 0, minSubj = Infinity, maxErr = 0;
  const firstAt: Record<string, boolean> = {};
  const once = (code: string, issue: Issue) => { if (!firstAt[code]) { firstAt[code] = true; issues.push(issue); } };

  sim.forEach((p, k) => {
    if (k > 0) dist += d3(p.pos, sim[k - 1]!.pos);
    maxSpeed = Math.max(maxSpeed, p.speedMs);
    maxAcc = Math.max(maxAcc, p.accelMs2);
    const h = p.pos.z - i.takeoffZ;
    minH = Math.min(minH, h); maxH = Math.max(maxH, h);
    maxFar = Math.max(maxFar, d2(p.pos, i.takeoff));
    minSubj = Math.min(minSubj, d3(p.pos, i.subjectAt(p.t)));
    maxErr = Math.max(maxErr, p.trackingErrorM);
    const g = i.groundZ[k];
    if (g !== null && g !== undefined) {
      const clr = p.pos.z - g;
      minClr = minClr === null ? clr : Math.min(minClr, clr);
      if (clr < 0) once("collision", { level: "technical-block", code: "collision", atS: p.t, message: `Collision virtuelle avec le relief à t = ${p.t.toFixed(1)} s (${clr.toFixed(0)} m sous le terrain modélisé).` });
      else if (clr < i.minClearanceM) once("clearance", { level: "warning", code: "clearance", atS: p.t, message: `Passage à ${clr.toFixed(1)} m du relief modélisé à t = ${p.t.toFixed(1)} s (seuil ${i.minClearanceM} m). Arbres, câbles et bâtiments ne sont pas modélisés.` });
    }
    if (p.speedMs > i.maxSpeedMs + 0.05) once("speed", { level: "warning", code: "speed", atS: p.t, message: `Vitesse simulée ${p.speedMs.toFixed(1)} m/s > limite réglée ${i.maxSpeedMs} m/s (t = ${p.t.toFixed(1)} s). Allongez le plan ou réduisez les distances.` });
  });
  if (maxAcc > i.maxAccelMs2 + 0.05) issues.push({ level: "warning", code: "accel", atS: 0, message: `Accélération simulée jusqu'à ${maxAcc.toFixed(1)} m/s² (> ${i.maxAccelMs2} m/s²) : mouvement brusque.` });
  if (minH < 0) issues.push({ level: "warning", code: "below-takeoff", atS: 0, message: `Le plan descend ${(-minH).toFixed(0)} m sous le point de décollage : vérifiez le relief et la visibilité.` });
  if (maxErr > 3) issues.push({ level: "warning", code: "tracking", atS: 0, message: `Avec l'inertie réglée, l'écart au plan atteint ${maxErr.toFixed(1)} m : plan trop dynamique.` });

  const duration = sim.length ? sim[sim.length - 1]!.t - sim[0]!.t : 0;
  return {
    isSimulation: true, durationS: duration, distanceM: dist, maxSpeedMs: maxSpeed, avgSpeedMs: duration > 0 ? dist / duration : 0,
    maxAccelMs2: maxAcc, minHeightTakeoffM: sim.length ? minH : 0, maxHeightTakeoffM: sim.length ? maxH : 0, minClearanceM: minClr,
    maxDistanceFromTakeoffM: maxFar, minDistanceToSubjectM: Number.isFinite(minSubj) ? minSubj : 0, maxTrackingErrorM: maxErr, issues,
  };
}
