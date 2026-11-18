import type { Shot } from "@dfs/shared-types";
import type { Vec3 } from "@dfs/trajectory-engine";
import { MOVES_BY_ID, type Look, type ShotContext, type ShotSample } from "./moves";
import { add, lerp, lerpHeading, lerpV, lookAngles, scale, sub } from "./math";

export interface CameraPose { headingDeg: number; pitchDeg: number }

export interface SequenceSample {
  t: number;
  /** Index of the shot being played, or -1 inside a transition (then `fromShot`/`toShot`). */
  shotIndex: number;
  inTransition: boolean;
  drone: Vec3;
  subject: Vec3;
  camera: CameraPose;
}

interface Segment { kind: "shot" | "transition"; start: number; duration: number; shotIndex: number }

export interface SequencePlan {
  shots: Shot[];
  segments: Segment[];
  durationS: number;
  /** Start time of each shot (after its incoming transition). */
  shotStarts: number[];
}

export function planSequence(shots: Shot[]): SequencePlan {
  const segments: Segment[] = [];
  const shotStarts: number[] = [];
  let t = 0;
  shots.forEach((s, i) => {
    if (i > 0 && s.transitionS > 0) { segments.push({ kind: "transition", start: t, duration: s.transitionS, shotIndex: i }); t += s.transitionS; }
    shotStarts.push(t);
    segments.push({ kind: "shot", start: t, duration: s.durationS, shotIndex: i });
    t += s.durationS;
  });
  return { shots, segments, durationS: t, shotStarts };
}

export function resolveLook(from: Vec3, look: Look): CameraPose {
  if (look.kind === "point") return lookAngles(from, look.target);
  if (look.kind === "angles") return { headingDeg: ((look.headingDeg % 360) + 360) % 360, pitchDeg: look.pitchDeg };
  const a = resolveLook(from, look.a), b = resolveLook(from, look.b);
  return { headingDeg: lerpHeading(a.headingDeg, b.headingDeg, look.t), pitchDeg: lerp(a.pitchDeg, b.pitchDeg, look.t) };
}

function sampleShot(shot: Shot, u: number, ctx: ShotContext): ShotSample {
  const move = MOVES_BY_ID[shot.moveId];
  if (!move) throw new Error(`Mouvement inconnu : ${shot.moveId}`);
  return move.sample(Math.min(1, Math.max(0, u)), { ...shot.params, __durationS: shot.durationS }, ctx);
}

/** Velocity (m/s) at the start/end of a shot, by finite difference. */
function shotVelocity(shot: Shot, at: 0 | 1, ctx: ShotContext): Vec3 {
  const eps = 0.01;
  const a = sampleShot(shot, at === 0 ? 0 : 1 - eps, ctx).drone;
  const b = sampleShot(shot, at === 0 ? eps : 1, ctx).drone;
  return scale(sub(b, a), 1 / (eps * shot.durationS));
}

/**
 * Evaluates the whole sequence at time t (s). Transitions use a cubic Hermite curve matching the
 * position AND velocity of the previous shot's end and the next shot's start (C1 continuity).
 */
export function evaluateSequence(plan: SequencePlan, t: number, ctx: ShotContext): SequenceSample | null {
  if (!plan.segments.length) return null;
  const time = Math.min(plan.durationS, Math.max(0, t));
  const seg = plan.segments.find((s) => time <= s.start + s.duration) ?? plan.segments[plan.segments.length - 1]!;
  const local = seg.duration > 0 ? (time - seg.start) / seg.duration : 1;
  const shot = plan.shots[seg.shotIndex]!;

  if (seg.kind === "shot") {
    const sm = sampleShot(shot, local, ctx);
    return { t: time, shotIndex: seg.shotIndex, inTransition: false, drone: sm.drone, subject: sm.subject, camera: resolveLook(sm.drone, sm.look) };
  }

  const prev = plan.shots[seg.shotIndex - 1]!;
  const A = sampleShot(prev, 1, ctx), B = sampleShot(shot, 0, ctx);
  const vA = shotVelocity(prev, 1, ctx), vB = shotVelocity(shot, 0, ctx);
  const T = seg.duration, s = local;
  const h00 = 2 * s ** 3 - 3 * s ** 2 + 1, h10 = s ** 3 - 2 * s ** 2 + s, h01 = -2 * s ** 3 + 3 * s ** 2, h11 = s ** 3 - s ** 2;
  const drone = add(add(scale(A.drone, h00), scale(vA, h10 * T)), add(scale(B.drone, h01), scale(vB, h11 * T)));
  const w = s * s * (3 - 2 * s);
  const ca = resolveLook(A.drone, A.look), cb = resolveLook(B.drone, B.look);
  return {
    t: time, shotIndex: -1, inTransition: true, drone, subject: lerpV(A.subject, B.subject, w),
    camera: { headingDeg: lerpHeading(ca.headingDeg, cb.headingDeg, w), pitchDeg: lerp(ca.pitchDeg, cb.pitchDeg, w) },
  };
}

/** Uniform samples of the whole sequence (default 10 Hz). */
export function sampleSequence(plan: SequencePlan, ctx: ShotContext, hz = 10): SequenceSample[] {
  const out: SequenceSample[] = [];
  const n = Math.max(2, Math.ceil(plan.durationS * hz) + 1);
  for (let i = 0; i < n; i++) {
    const s = evaluateSequence(plan, (plan.durationS * i) / (n - 1), ctx);
    if (s) out.push(s);
  }
  return out;
}
