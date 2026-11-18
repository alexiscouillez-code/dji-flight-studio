import type { Vec3 } from "@dfs/trajectory-engine";

export interface TimedPoint { t: number; pos: Vec3 }
export interface SimPoint { t: number; pos: Vec3; vel: Vec3; speedMs: number; accelMs2: number; trackingErrorM: number }

export interface SimOptions {
  mode: "ideal" | "inertia";
  maxSpeedMs: number;
  maxAccelMs2: number;
}

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const mul = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const len = (a: Vec3) => Math.hypot(a.x, a.y, a.z);
const limit = (a: Vec3, max: number) => { const l = len(a); return l > max && l > 0 ? mul(a, max / l) : a; };

/**
 * Simulates the drone along a planned path.
 * - ideal: follows the plan exactly (velocities by finite differences).
 * - inertia: point-mass follower with bounded speed and acceleration (PD tracking + feed-forward).
 *   This models *configurable* inertia — not the real flight dynamics of any specific aircraft.
 */
export function simulate(plan: TimedPoint[], opts: SimOptions): SimPoint[] {
  if (plan.length === 0) return [];
  const vel = (i: number): Vec3 => {
    const a = plan[Math.max(0, i - 1)]!, b = plan[Math.min(plan.length - 1, i + 1)]!;
    const dt = b.t - a.t;
    return dt > 0 ? mul(sub(b.pos, a.pos), 1 / dt) : { x: 0, y: 0, z: 0 };
  };

  if (opts.mode === "ideal") {
    const out: SimPoint[] = plan.map((p, i) => ({ t: p.t, pos: p.pos, vel: vel(i), speedMs: len(vel(i)), accelMs2: 0, trackingErrorM: 0 }));
    for (let i = 0; i < out.length; i++) {
      const a = out[Math.max(0, i - 1)]!, b = out[Math.min(out.length - 1, i + 1)]!;
      const dt = b.t - a.t;
      out[i]!.accelMs2 = dt > 0 ? len(sub(b.vel, a.vel)) / dt : 0;
    }
    return out;
  }

  // inertia: integrate at fine steps between plan samples
  const kp = 1.2, kd = 2.2;
  let pos = plan[0]!.pos, v: Vec3 = { x: 0, y: 0, z: 0 };
  const out: SimPoint[] = [{ t: plan[0]!.t, pos, vel: v, speedMs: 0, accelMs2: 0, trackingErrorM: 0 }];
  for (let i = 1; i < plan.length; i++) {
    const dtTot = plan[i]!.t - plan[i - 1]!.t;
    const steps = Math.max(1, Math.ceil(dtTot / 0.02));
    const dt = dtTot / steps;
    let lastA = 0;
    for (let k = 1; k <= steps; k++) {
      const f = k / steps;
      const target = add(plan[i - 1]!.pos, mul(sub(plan[i]!.pos, plan[i - 1]!.pos), f));
      const tv = vel(i);
      const desiredA = add(mul(sub(target, pos), kp), mul(sub(tv, v), kd));
      const a = limit(desiredA, opts.maxAccelMs2);
      v = limit(add(v, mul(a, dt)), opts.maxSpeedMs);
      pos = add(pos, mul(v, dt));
      lastA = len(a);
    }
    out.push({ t: plan[i]!.t, pos, vel: v, speedMs: len(v), accelMs2: lastA, trackingErrorM: len(sub(plan[i]!.pos, pos)) });
  }
  return out;
}
