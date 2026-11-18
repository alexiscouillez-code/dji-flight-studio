import type { Vec3 } from "@dfs/trajectory-engine";
import { catmullRomPoint, dist3 } from "@dfs/trajectory-engine";
import { add, alongPolyline, ease, lerp, lerpHeading, lerpV, polar, v } from "./math";

/**
 * Scene frame used by every move: local East-North-Up metres, origin = subject's ground point
 * at the start of the shot. z is height above that ground point (not above take-off).
 * Converting to geographic coordinates and to take-off-relative heights is the caller's job.
 */
export interface ShotContext {
  /** Subject path (scene frame) for moving-subject moves; index 0 should be the origin. */
  subjectTrack?: Vec3[];
  /** Waypoint path (scene frame) for the "custom-path" move. */
  customPath?: Vec3[];
  /** Height of the look-at point above the subject's ground (m). */
  subjectHeightM?: number;
}

export type Look =
  | { kind: "point"; target: Vec3 }
  | { kind: "angles"; headingDeg: number; pitchDeg: number }
  /** Blend between two looks (used by reveal-type moves). */
  | { kind: "blend"; a: Look; b: Look; t: number };

export interface ShotSample { drone: Vec3; subject: Vec3; look: Look }

export type ParamValue = number | string | boolean;
export type Params = Record<string, ParamValue>;

export interface ParamSpec {
  key: string;
  label: string;
  kind: "number" | "select" | "bool";
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
  default: ParamValue;
}

export type MoveCategory = "orbite" | "révélation" | "travelling" | "vertical" | "suivi";

export interface MoveDefinition {
  id: string;
  name: string;
  category: MoveCategory;
  description: string;
  defaultDurationS: number;
  /** True when the subject moves during the shot (uses ctx.subjectTrack or a straight line). */
  movingSubject: boolean;
  params: ParamSpec[];
  sample(u: number, p: Params, ctx: ShotContext): ShotSample;
}

// ---------- shared parameter specs ----------
const P = {
  radius: (d = 30): ParamSpec => ({ key: "radius", label: "Rayon", kind: "number", unit: "m", min: 3, max: 400, step: 1, default: d }),
  height: (d = 15, key = "height", label = "Hauteur / sujet"): ParamSpec => ({ key, label, kind: "number", unit: "m", min: 1, max: 120, step: 1, default: d }),
  distance: (d: number, key = "distance", label = "Distance au sujet"): ParamSpec => ({ key, label, kind: "number", unit: "m", min: 1, max: 500, step: 1, default: d }),
  bearing: (d = 180, key = "bearing", label = "Direction (cap depuis le sujet)"): ParamSpec => ({ key, label, kind: "number", unit: "°", min: 0, max: 359, step: 5, default: d }),
  sweep: (d: number): ParamSpec => ({ key: "sweep", label: "Angle parcouru", kind: "number", unit: "°", min: 10, max: 720, step: 5, default: d }),
  dir: (): ParamSpec => ({ key: "direction", label: "Sens", kind: "select", options: [{ value: "cw", label: "Horaire" }, { value: "ccw", label: "Anti-horaire" }], default: "cw" }),
  intensity: (d = 0.6): ParamSpec => ({ key: "intensity", label: "Intensité (douceur départ/arrivée)", kind: "number", min: 0, max: 1, step: 0.05, default: d }),
  speed: (d = 8): ParamSpec => ({ key: "subjectSpeedKmh", label: "Vitesse du sujet", kind: "number", unit: "km/h", min: 1, max: 60, step: 0.5, default: d }),
  heading: (d = 0): ParamSpec => ({ key: "heading", label: "Cap du sujet (si pas de GPX)", kind: "number", unit: "°", min: 0, max: 359, step: 5, default: d }),
  side: (): ParamSpec => ({ key: "side", label: "Côté", kind: "select", options: [{ value: "left", label: "Gauche" }, { value: "right", label: "Droite" }], default: "right" }),
};

const n = (p: Params, k: string, d: number) => (typeof p[k] === "number" && Number.isFinite(p[k]) ? (p[k] as number) : d);
const s = (p: Params, k: string, d: string) => (typeof p[k] === "string" ? (p[k] as string) : d);
const b = (p: Params, k: string, d: boolean) => (typeof p[k] === "boolean" ? (p[k] as boolean) : d);

const lookSubject = (subject: Vec3, ctx: ShotContext): Look => ({ kind: "point", target: add(subject, v(0, 0, ctx.subjectHeightM ?? 1.7)) });
const STATIC = v(0, 0, 0);

/** Subject position after `t` seconds: along the GPX track if any, else straight along `heading`. */
export function movingSubjectAt(tS: number, p: Params, ctx: ShotContext): { p: Vec3; bearingDeg: number } {
  const dist = (n(p, "subjectSpeedKmh", 8) / 3.6) * tS;
  if (ctx.subjectTrack && ctx.subjectTrack.length >= 2) return alongPolyline(ctx.subjectTrack, dist);
  const h = n(p, "heading", 0);
  return { p: polar(dist, h), bearingDeg: h };
}

function orbit(u: number, p: Params, ctx: ShotContext, sweepDefault: number, center: Vec3 = STATIC): ShotSample {
  const e = ease(u, n(p, "intensity", 0.4));
  const sign = s(p, "direction", "cw") === "ccw" ? -1 : 1;
  const ang = n(p, "bearing", 180) + sign * n(p, "sweep", sweepDefault) * e;
  const h = lerp(n(p, "heightStart", n(p, "height", 15)), n(p, "heightEnd", n(p, "height", 15)), e);
  const r = lerp(n(p, "radiusStart", n(p, "radius", 30)), n(p, "radiusEnd", n(p, "radius", 30)), e);
  return { drone: add(center, polar(r, ang, h)), subject: center, look: lookSubject(center, ctx) };
}

/** Radial move between two distances/heights along a bearing, always looking at the subject. */
function radial(u: number, p: Params, ctx: ShotContext, d0: number, d1: number, h0: number, h1: number): ShotSample {
  const e = ease(u, n(p, "intensity", 0.6));
  const brg = n(p, "bearing", 180);
  return { drone: polar(lerp(d0, d1, e), brg, lerp(h0, h1, e)), subject: STATIC, look: lookSubject(STATIC, ctx) };
}

export const MOVES: MoveDefinition[] = [
  {
    id: "orbit-360", name: "Orbit 360", category: "orbite", defaultDurationS: 20, movingSubject: false,
    description: "Tour complet autour du sujet à distance et hauteur constantes.",
    params: [P.radius(30), P.height(15), P.bearing(180, "bearing", "Cap de départ"), P.dir(), P.intensity(0.3)],
    sample: (u, p, c) => orbit(u, { ...p, sweep: 360 }, c, 360),
  },
  {
    id: "orbit-partial", name: "Orbit Partial", category: "orbite", defaultDurationS: 10, movingSubject: false,
    description: "Arc d'orbite : révèle le sujet sous plusieurs angles sans tour complet.",
    params: [P.radius(25), P.height(12), P.bearing(200, "bearing", "Cap de départ"), P.sweep(120), P.dir(), P.intensity(0.6)],
    sample: (u, p, c) => orbit(u, p, c, 120),
  },
  {
    id: "subject-orbit", name: "Subject Orbit", category: "orbite", defaultDurationS: 14, movingSubject: false,
    description: "Orbite serrée qui monte progressivement autour du sujet.",
    params: [P.radius(12), P.height(3, "heightStart", "Hauteur de départ"), P.height(18, "heightEnd", "Hauteur d'arrivée"), P.bearing(180, "bearing", "Cap de départ"), P.sweep(180), P.dir(), P.intensity(0.5)],
    sample: (u, p, c) => orbit(u, p, c, 180),
  },
  {
    id: "circular-follow", name: "Circular Follow", category: "suivi", defaultDurationS: 20, movingSubject: true,
    description: "Orbite autour d'un sujet en mouvement (traileur, cycliste).",
    params: [P.radius(20), P.height(10), P.bearing(180, "bearing", "Cap de départ"), P.sweep(360), P.dir(), P.speed(9), P.heading(0), P.intensity(0.2)],
    sample: (u, p, c) => {
      const sub = movingSubjectAt(u * n(p, "__durationS", 20), p, c).p;
      return orbit(u, p, c, 360, sub);
    },
  },
  {
    id: "reveal", name: "Reveal", category: "révélation", defaultDurationS: 10, movingSubject: false,
    description: "La caméra part tournée vers le sol puis se relève en avançant pour révéler le sujet.",
    params: [P.distance(45, "distanceStart", "Distance de départ"), P.distance(22, "distanceEnd", "Distance d'arrivée"), P.height(6, "heightStart", "Hauteur de départ"), P.height(14, "heightEnd", "Hauteur d'arrivée"), P.bearing(180), P.intensity(0.7)],
    sample: (u, p, c) => {
      const e = ease(u, n(p, "intensity", 0.7));
      const brg = n(p, "bearing", 180);
      const drone = polar(lerp(n(p, "distanceStart", 45), n(p, "distanceEnd", 22), e), brg, lerp(n(p, "heightStart", 6), n(p, "heightEnd", 14), e));
      const facing = (brg + 180) % 360;
      return { drone, subject: STATIC, look: { kind: "blend", a: { kind: "angles", headingDeg: facing, pitchDeg: -75 }, b: lookSubject(STATIC, c), t: ease(Math.min(1, u * 1.25), 0.8) } };
    },
  },
  {
    id: "pull-out", name: "Pull Out", category: "travelling", defaultDurationS: 12, movingSubject: false,
    description: "Recul progressif depuis le sujet pour révéler le décor.",
    params: [P.distance(8, "distanceStart", "Distance de départ"), P.distance(110, "distanceEnd", "Distance d'arrivée"), P.height(4, "heightStart", "Hauteur de départ"), P.height(45, "heightEnd", "Hauteur d'arrivée"), P.bearing(180), P.intensity(0.6)],
    sample: (u, p, c) => radial(u, p, c, n(p, "distanceStart", 8), n(p, "distanceEnd", 110), n(p, "heightStart", 4), n(p, "heightEnd", 45)),
  },
  {
    id: "push-in", name: "Push In", category: "travelling", defaultDurationS: 10, movingSubject: false,
    description: "Approche lente et continue vers le sujet.",
    params: [P.distance(110, "distanceStart", "Distance de départ"), P.distance(10, "distanceEnd", "Distance d'arrivée"), P.height(35, "heightStart", "Hauteur de départ"), P.height(5, "heightEnd", "Hauteur d'arrivée"), P.bearing(180), P.intensity(0.6)],
    sample: (u, p, c) => radial(u, p, c, n(p, "distanceStart", 110), n(p, "distanceEnd", 10), n(p, "heightStart", 35), n(p, "heightEnd", 5)),
  },
  {
    id: "ascend", name: "Ascend", category: "vertical", defaultDurationS: 10, movingSubject: false,
    description: "Montée verticale qui ouvre le cadre sur l'horizon.",
    params: [P.distance(15), P.height(2, "heightStart", "Hauteur de départ"), P.height(60, "heightEnd", "Hauteur d'arrivée"), P.bearing(180), { key: "lookAtSubject", label: "Garder le sujet au centre", kind: "bool", default: true }, P.intensity(0.6)],
    sample: (u, p, c) => {
      const e = ease(u, n(p, "intensity", 0.6));
      const drone = polar(n(p, "distance", 15), n(p, "bearing", 180), lerp(n(p, "heightStart", 2), n(p, "heightEnd", 60), e));
      return { drone, subject: STATIC, look: b(p, "lookAtSubject", true) ? lookSubject(STATIC, c) : { kind: "angles", headingDeg: (n(p, "bearing", 180) + 180) % 360, pitchDeg: -10 } };
    },
  },
  {
    id: "descend", name: "Descend", category: "vertical", defaultDurationS: 10, movingSubject: false,
    description: "Descente verticale vers le sujet, du panorama au détail.",
    params: [P.distance(15), P.height(60, "heightStart", "Hauteur de départ"), P.height(3, "heightEnd", "Hauteur d'arrivée"), P.bearing(180), { key: "lookAtSubject", label: "Garder le sujet au centre", kind: "bool", default: true }, P.intensity(0.6)],
    sample: (u, p, c) => {
      const e = ease(u, n(p, "intensity", 0.6));
      const drone = polar(n(p, "distance", 15), n(p, "bearing", 180), lerp(n(p, "heightStart", 60), n(p, "heightEnd", 3), e));
      return { drone, subject: STATIC, look: b(p, "lookAtSubject", true) ? lookSubject(STATIC, c) : { kind: "angles", headingDeg: (n(p, "bearing", 180) + 180) % 360, pitchDeg: -10 } };
    },
  },
  {
    id: "side-track", name: "Side Track", category: "travelling", defaultDurationS: 10, movingSubject: false,
    description: "Travelling latéral parallèle à l'axe du sujet.",
    params: [P.distance(15, "offset", "Écart latéral"), P.distance(60, "length", "Longueur du travelling"), P.height(3), P.bearing(0, "axis", "Axe du travelling"), P.side(), P.intensity(0.5)],
    sample: (u, p, c) => {
      const e = ease(u, n(p, "intensity", 0.5));
      const axis = n(p, "axis", 0);
      const sideB = axis + (s(p, "side", "right") === "right" ? 90 : -90);
      const L = n(p, "length", 60);
      const drone = add(polar(n(p, "offset", 15), sideB, n(p, "height", 3)), polar(lerp(-L / 2, L / 2, e), axis));
      return { drone, subject: STATIC, look: lookSubject(STATIC, c) };
    },
  },
  {
    id: "follow", name: "Follow", category: "suivi", defaultDurationS: 20, movingSubject: true,
    description: "Poursuite haute derrière le sujet, cadre large sur le parcours.",
    params: [P.distance(25), P.height(15), P.speed(9), P.heading(0), P.intensity(0.2)],
    sample: (u, p, c) => chase(u, p, c, 180, n(p, "distance", 25), n(p, "height", 15)),
  },
  {
    id: "top-down", name: "Top Down", category: "vertical", defaultDurationS: 12, movingSubject: false,
    description: "Vue zénithale au-dessus du sujet, avec rotation et montée optionnelles.",
    params: [P.height(30, "heightStart", "Hauteur de départ"), P.height(50, "heightEnd", "Hauteur d'arrivée"), { key: "rotation", label: "Rotation", kind: "number", unit: "°", min: 0, max: 360, step: 5, default: 90 }, P.intensity(0.5)],
    sample: (u, p) => {
      const e = ease(u, n(p, "intensity", 0.5));
      return { drone: v(0, 0, lerp(n(p, "heightStart", 30), n(p, "heightEnd", 50), e)), subject: STATIC, look: { kind: "angles", headingDeg: n(p, "rotation", 90) * e, pitchDeg: -90 } };
    },
  },
  {
    id: "drone-reveal", name: "Drone Reveal", category: "révélation", defaultDurationS: 12, movingSubject: false,
    description: "« Dronie » : recul en diagonale montante, le sujet reste au centre.",
    params: [P.distance(4, "distanceStart", "Distance de départ"), P.distance(70, "distanceEnd", "Distance d'arrivée"), { key: "slope", label: "Pente de montée", kind: "number", unit: "°", min: 5, max: 60, step: 1, default: 30 }, P.bearing(180), P.intensity(0.5)],
    sample: (u, p, c) => {
      const e = ease(u, n(p, "intensity", 0.5));
      const d = lerp(n(p, "distanceStart", 4), n(p, "distanceEnd", 70), e);
      const h = 2 + (d - n(p, "distanceStart", 4)) * Math.tan((n(p, "slope", 30) * Math.PI) / 180);
      return { drone: polar(d, n(p, "bearing", 180), h), subject: STATIC, look: lookSubject(STATIC, c) };
    },
  },
  {
    id: "fly-over", name: "Fly Over", category: "travelling", defaultDurationS: 10, movingSubject: false,
    description: "Survol du sujet en ligne droite, caméra tournée vers l'avant.",
    params: [P.distance(70, "length", "Distance avant/après"), P.height(25), P.bearing(180, "from", "Arrivée depuis le cap"), { key: "pitch", label: "Inclinaison caméra", kind: "number", unit: "°", min: -90, max: 0, step: 1, default: -25 }, P.intensity(0.3)],
    sample: (u, p) => {
      const e = ease(u, n(p, "intensity", 0.3));
      const from = n(p, "from", 180), L = n(p, "length", 70);
      const drone = polar(lerp(L, -L, e), from, n(p, "height", 25));
      return { drone, subject: STATIC, look: { kind: "angles", headingDeg: (from + 180) % 360, pitchDeg: n(p, "pitch", -25) } };
    },
  },
  {
    id: "cinematic-approach", name: "Cinematic Approach", category: "révélation", defaultDurationS: 14, movingSubject: false,
    description: "Approche en spirale descendante qui se resserre sur le sujet.",
    params: [P.distance(120, "radiusStart", "Rayon de départ"), P.distance(18, "radiusEnd", "Rayon d'arrivée"), P.height(50, "heightStart", "Hauteur de départ"), P.height(8, "heightEnd", "Hauteur d'arrivée"), P.bearing(160, "bearing", "Cap de départ"), P.sweep(90), P.dir(), P.intensity(0.6)],
    sample: (u, p, c) => orbit(u, p, c, 90),
  },
  {
    id: "mountain-reveal", name: "Mountain Reveal", category: "révélation", defaultDurationS: 12, movingSubject: false,
    description: "Passage d'arête en montant : le sujet est sur la crête, la vallée apparaît derrière.",
    params: [P.distance(25, "behind", "Recul de départ (derrière la crête)"), P.distance(70, "ahead", "Avancée au-delà"), P.height(4, "heightStart", "Hauteur de départ"), P.height(40, "heightEnd", "Hauteur d'arrivée"), P.bearing(0, "view", "Cap de la vallée à révéler"), P.intensity(0.6)],
    sample: (u, p) => {
      const e = ease(u, n(p, "intensity", 0.6));
      const view = n(p, "view", 0);
      const drone = polar(lerp(-n(p, "behind", 25), n(p, "ahead", 70), e), view, lerp(n(p, "heightStart", 4), n(p, "heightEnd", 40), e));
      return { drone, subject: STATIC, look: { kind: "angles", headingDeg: view, pitchDeg: lerp(-35, -8, e) } };
    },
  },
  {
    id: "valley-tracking", name: "Valley Tracking", category: "suivi", defaultDurationS: 25, movingSubject: true,
    description: "Suivi latéral large et haut, le sujet traverse la vallée.",
    params: [P.distance(45, "offset", "Écart latéral"), P.height(30), P.side(), P.speed(9), P.heading(0), P.intensity(0.2)],
    sample: (u, p, c) => {
      const { p: sub, bearingDeg } = movingSubjectAt(u * n(p, "__durationS", 25), p, c);
      const sideB = bearingDeg + (s(p, "side", "right") === "right" ? 90 : -90);
      return { drone: add(sub, polar(n(p, "offset", 45), sideB, n(p, "height", 30))), subject: sub, look: lookSubject(sub, c) };
    },
  },
  {
    id: "front-tracking", name: "Front Tracking", category: "suivi", defaultDurationS: 15, movingSubject: true,
    description: "Le drone recule devant le sujet qui avance vers la caméra.",
    params: [P.distance(10), P.height(2.5), P.speed(9), P.heading(0), P.intensity(0.2)],
    sample: (u, p, c) => chase(u, p, c, 0, n(p, "distance", 10), n(p, "height", 2.5)),
  },
  {
    id: "rear-tracking", name: "Rear Tracking", category: "suivi", defaultDurationS: 15, movingSubject: true,
    description: "Poursuite basse et proche dans le dos du sujet.",
    params: [P.distance(8), P.height(2.5), P.speed(9), P.heading(0), P.intensity(0.2)],
    sample: (u, p, c) => chase(u, p, c, 180, n(p, "distance", 8), n(p, "height", 2.5)),
  },
  {
    id: "dynamic-pass", name: "Dynamic Pass", category: "travelling", defaultDurationS: 6, movingSubject: false,
    description: "Passage rapide et bas à côté du sujet, la caméra le suit en pivotant.",
    params: [P.distance(6, "offset", "Écart latéral"), P.distance(60, "length", "Longueur du passage"), P.height(4), P.bearing(0, "axis", "Axe du passage"), P.side(), P.intensity(0.1)],
    sample: (u, p, c) => {
      const e = ease(u, n(p, "intensity", 0.1));
      const axis = n(p, "axis", 0);
      const sideB = axis + (s(p, "side", "right") === "right" ? 90 : -90);
      const L = n(p, "length", 60);
      return { drone: add(polar(n(p, "offset", 6), sideB, n(p, "height", 4)), polar(lerp(-L / 2, L / 2, e), axis)), subject: STATIC, look: lookSubject(STATIC, c) };
    },
  },
  {
    id: "custom-path", name: "Trajectoire personnalisée", category: "travelling", defaultDurationS: 20, movingSubject: false,
    description: "Suit les waypoints du Flight Designer (spline Catmull-Rom).",
    params: [{ key: "cameraMode", label: "Caméra", kind: "select", options: [{ value: "subject", label: "Regarde le sujet" }, { value: "forward", label: "Vers l'avant" }], default: "subject" }, { key: "pitch", label: "Inclinaison (vers l'avant)", kind: "number", unit: "°", min: -90, max: 0, step: 1, default: -15 }, P.intensity(0.5)],
    sample: (u, p, c) => {
      const pts = c.customPath ?? [];
      if (pts.length < 2) return { drone: pts[0] ?? v(0, 0, 10), subject: STATIC, look: lookSubject(STATIC, c) };
      const e = ease(u, n(p, "intensity", 0.5));
      const poly = densify(pts);
      const here = alongArc(poly, e);
      const ahead = alongArc(poly, Math.min(1, e + 0.01));
      const look: Look = s(p, "cameraMode", "subject") === "forward" && dist3(here, ahead) > 1e-3
        ? { kind: "angles", headingDeg: (Math.atan2(ahead.x - here.x, ahead.y - here.y) * 180) / Math.PI, pitchDeg: n(p, "pitch", -15) }
        : lookSubject(STATIC, c);
      return { drone: here, subject: STATIC, look };
    },
  },
];

function chase(u: number, p: Params, c: ShotContext, relBearing: number, d: number, h: number): ShotSample {
  const { p: sub, bearingDeg } = movingSubjectAt(u * n(p, "__durationS", 15), p, c);
  return { drone: add(sub, polar(d, bearingDeg + relBearing, h)), subject: sub, look: lookSubject(sub, c) };
}

const densifyCache = new WeakMap<Vec3[], { pts: Vec3[]; cum: number[] }>();
function densify(pts: Vec3[]) {
  const hit = densifyCache.get(pts);
  if (hit) return hit;
  const out: Vec3[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i]!, p2 = pts[i + 1]!;
    const p0 = pts[i - 1] ?? lerpV(p1, p2, -1), p3 = pts[i + 2] ?? lerpV(p2, p1, -1);
    for (let k = 0; k < 24; k++) out.push(catmullRomPoint(p0, p1, p2, p3, k / 24));
  }
  out.push(pts[pts.length - 1]!);
  const cum = [0];
  for (let i = 1; i < out.length; i++) cum.push(cum[i - 1]! + dist3(out[i - 1]!, out[i]!));
  const r = { pts: out, cum };
  densifyCache.set(pts, r);
  return r;
}
function alongArc(d: { pts: Vec3[]; cum: number[] }, f: number): Vec3 {
  const total = d.cum[d.cum.length - 1]!;
  const target = f * total;
  let i = 1;
  while (i < d.cum.length - 1 && d.cum[i]! < target) i++;
  const seg = d.cum[i]! - d.cum[i - 1]!;
  return lerpV(d.pts[i - 1]!, d.pts[i]!, seg > 0 ? (target - d.cum[i - 1]!) / seg : 0);
}

export const MOVES_BY_ID: Record<string, MoveDefinition> = Object.fromEntries(MOVES.map((m) => [m.id, m]));

export function defaultParams(moveId: string): Params {
  const m = MOVES_BY_ID[moveId];
  return m ? Object.fromEntries(m.params.map((p) => [p.key, p.default])) : {};
}

/** Validates and clamps user params against the move's spec (unknown keys dropped). */
export function sanitizeParams(moveId: string, input: Params): Params {
  const m = MOVES_BY_ID[moveId];
  if (!m) return {};
  const out: Params = {};
  for (const spec of m.params) {
    const val = input[spec.key];
    if (spec.kind === "number" && typeof val === "number" && Number.isFinite(val)) out[spec.key] = Math.min(spec.max ?? Infinity, Math.max(spec.min ?? -Infinity, val));
    else if (spec.kind === "select" && typeof val === "string" && spec.options?.some((o) => o.value === val)) out[spec.key] = val;
    else if (spec.kind === "bool" && typeof val === "boolean") out[spec.key] = val;
    else out[spec.key] = spec.default;
  }
  return out;
}

export { lerpHeading };
