/**
 * Solar position and sun times (sunrise, sunset, golden hour) for a date and place.
 * Formulas after V. Agafonkin's SunCalc (BSD-2-Clause), themselves based on
 * astronomical approximations from aa.quae.nl. Accuracy: ~1–2 minutes for sun times.
 */
const rad = Math.PI / 180;
const dayMs = 86400000, J1970 = 2440588, J2000 = 2451545;
const toJulian = (d: Date) => d.valueOf() / dayMs - 0.5 + J1970;
const fromJulian = (j: number) => new Date((j + 0.5 - J1970) * dayMs);
const toDays = (d: Date) => toJulian(d) - J2000;
const e = rad * 23.4397;
const rightAscension = (l: number, b: number) => Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
const declination = (l: number, b: number) => Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
const azimuth = (H: number, phi: number, dec: number) => Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
const altitude = (H: number, phi: number, dec: number) => Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
const siderealTime = (d: number, lw: number) => rad * (280.16 + 360.9856235 * d) - lw;
const solarMeanAnomaly = (d: number) => rad * (357.5291 + 0.98560028 * d);
function eclipticLongitude(M: number) {
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  return M + C + rad * 102.9372 + Math.PI;
}
function sunCoords(d: number) {
  const L = eclipticLongitude(solarMeanAnomaly(d));
  return { dec: declination(L, 0), ra: rightAscension(L, 0) };
}

/** Sun azimuth (deg clockwise from north) and altitude above the horizon (deg). */
export function sunPosition(date: Date, lat: number, lon: number): { azimuthDeg: number; altitudeDeg: number } {
  const lw = rad * -lon, phi = rad * lat, d = toDays(date);
  const c = sunCoords(d);
  const H = siderealTime(d, lw) - c.ra;
  return { azimuthDeg: ((azimuth(H, phi, c.dec) / rad + 180) % 360 + 360) % 360, altitudeDeg: altitude(H, phi, c.dec) / rad };
}

const J0 = 0.0009;
const julianCycle = (d: number, lw: number) => Math.round(d - J0 - lw / (2 * Math.PI));
const approxTransit = (Ht: number, lw: number, n: number) => J0 + (Ht + lw) / (2 * Math.PI) + n;
const solarTransitJ = (ds: number, M: number, L: number) => J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
const hourAngle = (h: number, phi: number, d: number) => Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(d)) / (Math.cos(phi) * Math.cos(d)));

export interface SunTimes {
  solarNoon: Date;
  sunrise: Date | null;
  sunset: Date | null;
  /** Morning golden hour ends / evening golden hour starts (sun at +6°). */
  goldenHourMorningEnd: Date | null;
  goldenHourEvening: Date | null;
  /** Civil dusk / dawn (sun at −6°): end of usable light for most cameras. */
  dawn: Date | null;
  dusk: Date | null;
}

export function sunTimes(date: Date, lat: number, lon: number): SunTimes {
  const lw = rad * -lon, phi = rad * lat;
  const d = toDays(date), n = julianCycle(d, lw), ds = approxTransit(0, lw, n);
  const M = solarMeanAnomaly(ds), L = eclipticLongitude(M), dec = declination(L, 0);
  const Jnoon = solarTransitJ(ds, M, L);
  const pair = (deg: number): [Date | null, Date | null] => {
    const w = hourAngle(deg * rad, phi, dec);
    if (!Number.isFinite(w)) return [null, null]; // polar day/night
    const Jset = solarTransitJ(approxTransit(w, lw, n), M, L);
    return [fromJulian(Jnoon - (Jset - Jnoon)), fromJulian(Jset)];
  };
  const [sunrise, sunset] = pair(-0.833);
  const [gm, ge] = pair(6);
  const [dawn, dusk] = pair(-6);
  return { solarNoon: fromJulian(Jnoon), sunrise, sunset, goldenHourMorningEnd: gm, goldenHourEvening: ge, dawn, dusk };
}
