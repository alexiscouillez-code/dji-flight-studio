import type { LatLon } from "@dfs/shared-types";

/** WGS84 ellipsoid constants. */
export const WGS84 = {
  a: 6378137.0,
  f: 1 / 298.257223563,
} as const;
const E2 = WGS84.f * (2 - WGS84.f);
/** Mean Earth radius (IUGG), metres — used for haversine. */
export const MEAN_EARTH_RADIUS_M = 6371008.8;

const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

/** Great-circle distance (haversine), metres. Accuracy ~0.5 % vs ellipsoid — fine for planning. */
export function haversineDistanceM(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * MEAN_EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing from a to b, degrees clockwise from true north [0,360). */
export function initialBearingDeg(a: LatLon, b: LatLon): number {
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const Δλ = toRad(b.lon - a.lon);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export interface Ecef { x: number; y: number; z: number }
export interface Enu { e: number; n: number; u: number }

/** Geodetic (lat, lon, ellipsoidal height h) → ECEF metres. */
export function geodeticToEcef(p: LatLon, h: number): Ecef {
  const φ = toRad(p.lat);
  const λ = toRad(p.lon);
  const sinφ = Math.sin(φ);
  const N = WGS84.a / Math.sqrt(1 - E2 * sinφ * sinφ);
  return {
    x: (N + h) * Math.cos(φ) * Math.cos(λ),
    y: (N + h) * Math.cos(φ) * Math.sin(λ),
    z: (N * (1 - E2) + h) * sinφ,
  };
}

/** ECEF → geodetic (Bowring iterative, converges < 1 mm in 3–4 iterations). */
export function ecefToGeodetic(c: Ecef): LatLon & { h: number } {
  const λ = Math.atan2(c.y, c.x);
  const p = Math.hypot(c.x, c.y);
  let φ = Math.atan2(c.z, p * (1 - E2));
  let h = 0;
  for (let i = 0; i < 6; i++) {
    const sinφ = Math.sin(φ);
    const N = WGS84.a / Math.sqrt(1 - E2 * sinφ * sinφ);
    h = p / Math.cos(φ) - N;
    φ = Math.atan2(c.z, p * (1 - (E2 * N) / (N + h)));
  }
  return { lat: toDeg(φ), lon: toDeg(λ), h };
}

/**
 * Local East-North-Up frame anchored at `origin`. This is the bridge between the
 * geographic world (Cesium, WGS84) and the local 3D scene (Three.js, metres).
 */
export function createEnuFrame(origin: LatLon, originH = 0) {
  const φ = toRad(origin.lat);
  const λ = toRad(origin.lon);
  const sφ = Math.sin(φ), cφ = Math.cos(φ), sλ = Math.sin(λ), cλ = Math.cos(λ);
  const o = geodeticToEcef(origin, originH);
  return {
    toEnu(p: LatLon, h: number): Enu {
      const c = geodeticToEcef(p, h);
      const dx = c.x - o.x, dy = c.y - o.y, dz = c.z - o.z;
      return {
        e: -sλ * dx + cλ * dy,
        n: -sφ * cλ * dx - sφ * sλ * dy + cφ * dz,
        u: cφ * cλ * dx + cφ * sλ * dy + sφ * dz,
      };
    },
    fromEnu(v: Enu): LatLon & { h: number } {
      const dx = -sλ * v.e - sφ * cλ * v.n + cφ * cλ * v.u;
      const dy = cλ * v.e - sφ * sλ * v.n + cφ * sλ * v.u;
      const dz = cφ * v.n + sφ * v.u;
      return ecefToGeodetic({ x: o.x + dx, y: o.y + dy, z: o.z + dz });
    },
  };
}
