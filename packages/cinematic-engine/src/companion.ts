import type { Vec3 } from "@dfs/trajectory-engine";
import { MOVES_BY_ID } from "./moves";
import type { SequencePlan, SequenceSample } from "./sequence";

/**
 * Neo 2 Companion guide (prompt §15): turns a planned sequence into *preparation cues* for
 * manual piloting in DJI Fly. Nothing here is a flight command: the pilot keeps full control.
 */

export interface PositionCue {
  /** Height relative to the take-off point (what DJI Fly shows as "H"). */
  heightTakeoffM: number;
  /** Horizontal distance to the subject. */
  distanceToSubjectM: number;
  /** Where the drone stands, seen from the subject (deg + French compass label). */
  bearingFromSubjectDeg: number;
  bearingLabel: string;
  /** Camera heading and gimbal pitch. */
  cameraHeadingDeg: number;
  cameraHeadingLabel: string;
  gimbalPitchDeg: number;
}

export interface NativeModeHint { name: string; note: string }

export interface CompanionStep {
  index: number;
  shotId: string;
  title: string;
  moveId: string;
  description: string;
  durationS: number;
  /** Transition flown just before this shot (s). */
  transitionInS: number;
  start: PositionCue;
  end: PositionCue;
  distanceM: number;
  avgSpeedMs: number;
  maxSpeedMs: number;
  heightChangeM: number;
  subjectDistanceChangeM: number;
  /** Signed angle swept around the subject (deg, + = clockwise seen from above). */
  orbitSweepDeg: number;
  subjectMovesM: number;
  sticks: string[];
  nativeMode: NativeModeHint | null;
  tips: string[];
  /** Normalised top-view polyline of this step (0..1) with subject positions, for small previews. */
  preview: { drone: { x: number; y: number }[]; subject: { x: number; y: number }[] };
}

export interface CompanionGuide {
  steps: CompanionStep[];
  totalDurationS: number;
  maxHeightTakeoffM: number;
  maxDistanceFromTakeoffM: number;
  warnings: string[];
}

const COMPASS = ["nord", "nord-nord-est", "nord-est", "est-nord-est", "est", "est-sud-est", "sud-est", "sud-sud-est", "sud", "sud-sud-ouest", "sud-ouest", "ouest-sud-ouest", "ouest", "ouest-nord-ouest", "nord-ouest", "nord-nord-ouest"];
export const compassLabel = (deg: number) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16]!;
const bearing = (dx: number, dy: number) => ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
const angDiff = (a: number, b: number) => ((((b - a) % 360) + 540) % 360) - 180;

/**
 * Intelligent shooting modes listed for DJI Neo 2 in DJI's official FAQ (palm / app control).
 * Availability depends on the controller and the DJI Fly version — the guide says so.
 */
const NATIVE: Record<string, NativeModeHint> = {
  "orbit-360": { name: "Circle", note: "Mode intelligent « Circle » de DJI Fly : réglez distance et hauteur sur les valeurs de départ ci-dessus." },
  "orbit-partial": { name: "Circle", note: "« Circle » de DJI Fly, arrêté manuellement après l'angle prévu — ou pilotage manuel." },
  "subject-orbit": { name: "Circle", note: "« Circle » puis montée progressive au stick gauche, ou pilotage manuel." },
  "drone-reveal": { name: "Dronie", note: "Mode intelligent « Dronie » de DJI Fly : recul en diagonale montante, sujet centré." },
  follow: { name: "Follow", note: "Mode « Follow » de DJI Fly : le Neo 2 suit le sujet ; ajustez distance et hauteur." },
  "rear-tracking": { name: "Follow", note: "Mode « Follow » de DJI Fly, en position basse derrière le sujet." },
};

export const NATIVE_MODES_SOURCE = { title: "DJI Neo 2 — FAQ officielle (modes de prise de vue intelligents)", url: "https://www.dji.com/neo-2/faq" };

function cue(s: SequenceSample, takeoffZ: number): PositionCue {
  const dx = s.drone.x - s.subject.x, dy = s.drone.y - s.subject.y;
  const b = bearing(dx, dy);
  return {
    heightTakeoffM: s.drone.z - takeoffZ,
    distanceToSubjectM: Math.hypot(dx, dy),
    bearingFromSubjectDeg: b,
    bearingLabel: compassLabel(b),
    cameraHeadingDeg: s.camera.headingDeg,
    cameraHeadingLabel: compassLabel(s.camera.headingDeg),
    gimbalPitchDeg: s.camera.pitchDeg,
  };
}

/** Manual stick cues for RC-N2 in Mode 2 (DJI default: left = altitude/yaw, right = pitch/roll). */
function stickCues(steps: SequenceSample[], start: PositionCue, end: PositionCue, sweep: number, facesSubject: boolean, subjectMoves: number): string[] {
  const out: string[] = [];
  const dh = end.heightTakeoffM - start.heightTakeoffM;
  const dd = end.distanceToSubjectM - start.distanceToSubjectM;
  if (subjectMoves > 5) out.push(`Suivez le sujet (${subjectMoves.toFixed(0)} m parcourus) en gardant l'écart et la hauteur indiqués.`);
  if (Math.abs(sweep) > 15) {
    const cw = sweep > 0;
    out.push(`Orbite ${cw ? "horaire" : "anti-horaire"} de ${Math.abs(sweep).toFixed(0)}° : stick droit vers la ${cw ? "gauche" : "droite"} (translation) + stick gauche vers la ${cw ? "droite" : "gauche"} (rotation) pour garder le sujet centré.`);
  }
  if (Math.abs(dd) > 5 && Math.abs(sweep) <= 15) {
    out.push(facesSubject
      ? `${dd > 0 ? "Reculer" : "Avancer"} de ${Math.abs(dd).toFixed(0)} m : stick droit vers ${dd > 0 ? "l'arrière" : "l'avant"}.`
      : `Avancer vers le ${end.cameraHeadingLabel} : stick droit vers l'avant.`);
  }
  if (Math.abs(dh) > 2) out.push(`${dh > 0 ? "Monter" : "Descendre"} de ${Math.abs(dh).toFixed(0)} m : stick gauche vers ${dh > 0 ? "le haut" : "le bas"}, progressivement.`);
  const dp = end.gimbalPitchDeg - start.gimbalPitchDeg;
  if (Math.abs(dp) > 8) out.push(`Nacelle : ${dp > 0 ? "relever" : "abaisser"} de ${Math.abs(dp).toFixed(0)}° (molette gauche de la radiocommande), lentement.`);
  if (!out.length) out.push("Plan quasi statique : stabilisez le drone et laissez tourner la caméra.");
  if (steps.length < 2) return out;
  return out;
}

export function buildCompanionGuide(plan: SequencePlan, samples: SequenceSample[], opts: { takeoff: Vec3; takeoffZ: number; hz?: number }): CompanionGuide {
  const hz = opts.hz ?? 10;
  const steps: CompanionStep[] = [];
  const warnings: string[] = [];
  let maxH = -Infinity, maxFar = 0;

  plan.shots.forEach((shot, i) => {
    const t0 = plan.shotStarts[i]!, t1 = t0 + shot.durationS;
    const sl = samples.filter((s) => s.t >= t0 - 1e-6 && s.t <= t1 + 1e-6);
    if (sl.length < 2) return;
    const a = sl[0]!, b = sl[sl.length - 1]!;
    const start = cue(a, opts.takeoffZ), end = cue(b, opts.takeoffZ);
    let dist = 0, vmax = 0, sweep = 0, subjMoves = 0;
    for (let k = 1; k < sl.length; k++) {
      const p = sl[k - 1]!, q = sl[k]!;
      const d = Math.hypot(q.drone.x - p.drone.x, q.drone.y - p.drone.y, q.drone.z - p.drone.z);
      dist += d; vmax = Math.max(vmax, d * hz);
      subjMoves += Math.hypot(q.subject.x - p.subject.x, q.subject.y - p.subject.y);
      const r1 = Math.hypot(p.drone.x - p.subject.x, p.drone.y - p.subject.y), r2 = Math.hypot(q.drone.x - q.subject.x, q.drone.y - q.subject.y);
      if (r1 > 2 && r2 > 2) sweep += angDiff(bearing(p.drone.x - p.subject.x, p.drone.y - p.subject.y), bearing(q.drone.x - q.subject.x, q.drone.y - q.subject.y));
    }
    for (const s of sl) { maxH = Math.max(maxH, s.drone.z - opts.takeoffZ); maxFar = Math.max(maxFar, Math.hypot(s.drone.x - opts.takeoff.x, s.drone.y - opts.takeoff.y)); }
    // does the camera keep the subject roughly in frame (heading ≈ bearing towards subject)?
    const facing = sl.filter((s) => Math.abs(angDiff(s.camera.headingDeg, bearing(s.subject.x - s.drone.x, s.subject.y - s.drone.y))) < 25).length / sl.length > 0.6;
    const move = MOVES_BY_ID[shot.moveId];
    const tips: string[] = [];
    if (vmax > 6) tips.push(`Vitesse prévue jusqu'à ${vmax.toFixed(1)} m/s : répétez d'abord plus lentement.`);
    if (start.heightTakeoffM < 3 || end.heightTakeoffM < 3) tips.push("Passage bas (< 3 m) : vérifiez le terrain et les obstacles sur place.");
    if (Math.min(start.distanceToSubjectM, end.distanceToSubjectM) < 4) tips.push("Très près du sujet : prévenez-le et gardez une marge.");
    if (move?.movingSubject) tips.push("Accordez-vous avec le sujet sur le départ et l'allure (vitesse prévue dans les paramètres du plan).");

    const xs = sl.flatMap((s) => [s.drone.x, s.subject.x]), ys = sl.flatMap((s) => [s.drone.y, s.subject.y]);
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 10);
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
    const norm = (x: number, y: number) => ({ x: 0.5 + (x - cx) / (span * 1.2), y: 0.5 - (y - cy) / (span * 1.2) });
    const stride = Math.max(1, Math.floor(sl.length / 60));

    steps.push({
      index: steps.length, shotId: shot.id, title: shot.label ?? move?.name ?? shot.moveId, moveId: shot.moveId,
      description: move?.description ?? "", durationS: shot.durationS, transitionInS: i > 0 ? shot.transitionS : 0,
      start, end, distanceM: dist, avgSpeedMs: dist / shot.durationS, maxSpeedMs: vmax,
      heightChangeM: end.heightTakeoffM - start.heightTakeoffM, subjectDistanceChangeM: end.distanceToSubjectM - start.distanceToSubjectM,
      orbitSweepDeg: sweep, subjectMovesM: subjMoves,
      sticks: stickCues(sl, start, end, sweep, facing, subjMoves),
      nativeMode: NATIVE[shot.moveId] ?? null, tips,
      preview: { drone: sl.filter((_, k) => k % stride === 0).map((s) => norm(s.drone.x, s.drone.y)), subject: sl.filter((_, k) => k % stride === 0).map((s) => norm(s.subject.x, s.subject.y)) },
    });
  });

  if (maxH > 60) warnings.push("Hauteur > 60 m : au-delà de la limite du Neo 2 en contrôle par smartphone (radiocommande requise).");
  if (maxH > 120) warnings.push("Hauteur > 120 m / décollage : vérifiez la réglementation applicable.");
  if (maxFar > 500) warnings.push(`Éloignement jusqu'à ${maxFar.toFixed(0)} m : gardez le drone en vue directe.`);
  return { steps, totalDurationS: plan.durationS, maxHeightTakeoffM: Number.isFinite(maxH) ? maxH : 0, maxDistanceFromTakeoffM: maxFar, warnings };
}

/** Plain-text (Markdown) version of the guide for export / printing. */
export function guideToMarkdown(projectName: string, g: CompanionGuide, extra: { takeoff?: string; subject?: string } = {}): string {
  const r = (n: number) => Math.round(n);
  const lines = [
    `# ${projectName} — guide de vol manuel (DJI Neo 2 + DJI Fly)`,
    "",
    "> Repères de préparation, pas des commandes de vol. Le pilote garde le contrôle permanent ; DJI Fly reste responsable du pilotage.",
    "",
    extra.takeoff ? `- Décollage : ${extra.takeoff}` : "",
    extra.subject ? `- Sujet : ${extra.subject}` : "",
    `- Durée totale indicative : ${r(g.totalDurationS)} s · hauteur max ${r(g.maxHeightTakeoffM)} m / décollage · éloignement max ${r(g.maxDistanceFromTakeoffM)} m`,
    ...g.warnings.map((w) => `- ⚠ ${w}`),
    "",
  ];
  for (const s of g.steps) {
    lines.push(`## ${s.index + 1}. ${s.title} — ${r(s.durationS)} s${s.transitionInS ? ` (après ${s.transitionInS} s de transition)` : ""}`, "", s.description, "",
      `- Départ : ${r(s.start.distanceToSubjectM)} m au ${s.start.bearingLabel} du sujet, H ${r(s.start.heightTakeoffM)} m, caméra vers le ${s.start.cameraHeadingLabel}, nacelle ${r(s.start.gimbalPitchDeg)}°`,
      `- Arrivée : ${r(s.end.distanceToSubjectM)} m au ${s.end.bearingLabel} du sujet, H ${r(s.end.heightTakeoffM)} m, caméra vers le ${s.end.cameraHeadingLabel}, nacelle ${r(s.end.gimbalPitchDeg)}°`,
      `- Trajet ≈ ${r(s.distanceM)} m, vitesse moyenne ${s.avgSpeedMs.toFixed(1)} m/s (max ${s.maxSpeedMs.toFixed(1)} m/s)`,
      ...s.sticks.map((x) => `- ${x}`),
      ...(s.nativeMode ? [`- Mode DJI Fly possible : ${s.nativeMode.note}`] : []),
      ...s.tips.map((x) => `- Conseil : ${x}`), "");
  }
  lines.push("---", "Sticks décrits en Mode 2 (réglage par défaut DJI). Valeurs simulées : à adapter sur place.", `Modes intelligents : ${NATIVE_MODES_SOURCE.url}`);
  return lines.filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
}
