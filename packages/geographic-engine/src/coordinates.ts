import type { LatLon } from "@dfs/shared-types";

/**
 * Parses user-typed coordinates. Supports:
 *  - "45.8326, 6.8652" / "45.8326 6.8652" / "45,8326; 6,8652"
 *  - DMS: 45°49'57"N 6°51'54"E (also with ′ ″ and spaces)
 * Returns null if the input is not a coordinate (so it can fall back to geocoding).
 */
export function parseCoordinates(input: string): LatLon | null {
  const s = input.trim();
  if (!s) return null;

  const dms = /^(\d{1,3})[°\s]+(\d{1,2})['′\s]+(\d{1,2}(?:[.,]\d+)?)["″]?\s*([NS])[\s,;]+(\d{1,3})[°\s]+(\d{1,2})['′\s]+(\d{1,2}(?:[.,]\d+)?)["″]?\s*([EOW])$/i.exec(s);
  if (dms) {
    const [, d1, m1, s1, h1, d2, m2, s2, h2] = dms as unknown as string[];
    const conv = (d: string, m: string, sec: string) => Number(d) + Number(m) / 60 + Number(sec.replace(",", ".")) / 3600;
    let lat = conv(d1!, m1!, s1!);
    let lon = conv(d2!, m2!, s2!);
    if (h1!.toUpperCase() === "S") lat = -lat;
    if (h2!.toUpperCase() === "W") lon = -lon;
    return valid(lat, lon);
  }

  // decimal: separators between the two numbers can be comma+space, semicolon or whitespace.
  const dec = /^(-?\d{1,3}(?:[.,]\d+)?)\s*(?:[;\s]|,\s)\s*(-?\d{1,3}(?:[.,]\d+)?)$/.exec(s)
    ?? /^(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)$/.exec(s);
  if (dec) {
    return valid(Number(dec[1]!.replace(",", ".")), Number(dec[2]!.replace(",", ".")));
  }
  return null;
}

function valid(lat: number, lon: number): LatLon | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

export function formatLatLon(p: LatLon, digits = 5): string {
  const ns = p.lat >= 0 ? "N" : "S";
  const ew = p.lon >= 0 ? "E" : "O";
  return `${Math.abs(p.lat).toFixed(digits)}° ${ns}, ${Math.abs(p.lon).toFixed(digits)}° ${ew}`;
}
