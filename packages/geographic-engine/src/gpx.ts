import { XMLParser } from "fast-xml-parser";
import { haversineDistanceM } from "./geodesy";

export interface GpxPoint {
  lat: number;
  lon: number;
  /** Elevation from the GPX <ele> tag (metres, usually MSL — source device dependent). */
  ele: number | null;
  time: string | null;
}

export interface GpxTrack {
  name: string | null;
  points: GpxPoint[];
  warnings: string[];
}

export interface ElevationSample { distanceM: number; ele: number }

export interface GpxStats {
  pointCount: number;
  distanceM: number;
  /** null when the track has too few elevations to compute it honestly. */
  ascentM: number | null;
  descentM: number | null;
  minEle: number | null;
  maxEle: number | null;
  elevationCoverage: number; // 0..1 share of points with elevation
  profile: ElevationSample[];
  start: GpxPoint | null;
  end: GpxPoint | null;
}

export class GpxParseError extends Error {}

const MAX_POINTS = 200_000;

const asArray = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

/** Parses GPX 1.0/1.1 text: <trk>/<trkseg>/<trkpt>, falling back to <rte>/<rtept>. */
export function parseGpx(xml: string): GpxTrack {
  if (typeof xml !== "string" || !xml.includes("<gpx")) {
    throw new GpxParseError("Fichier non reconnu comme GPX (balise <gpx> absente).");
  }
  let doc: any;
  try {
    doc = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", removeNSPrefix: true, processEntities: false }).parse(xml);
  } catch (e) {
    throw new GpxParseError(`XML invalide : ${(e as Error).message}`);
  }
  const gpx = doc?.gpx;
  if (!gpx) throw new GpxParseError("Racine <gpx> introuvable.");

  const warnings: string[] = [];
  const raw: any[] = [];
  const trks = asArray(gpx.trk);
  for (const trk of trks) for (const seg of asArray(trk.trkseg)) raw.push(...asArray(seg.trkpt));
  if (raw.length === 0) for (const rte of asArray(gpx.rte)) raw.push(...asArray(rte.rtept));
  if (raw.length === 0) throw new GpxParseError("Aucun point de trace (<trkpt> ou <rtept>) trouvé.");
  if (raw.length > MAX_POINTS) throw new GpxParseError(`Trace trop volumineuse (${raw.length} points, max ${MAX_POINTS}).`);

  const points: GpxPoint[] = [];
  let dropped = 0;
  for (const p of raw) {
    const lat = Number(p?.["@_lat"]);
    const lon = Number(p?.["@_lon"]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      dropped++;
      continue;
    }
    const eleNum = p?.ele === undefined || p?.ele === "" ? NaN : Number(p.ele);
    points.push({
      lat,
      lon,
      ele: Number.isFinite(eleNum) ? eleNum : null,
      time: typeof p?.time === "string" ? p.time : null,
    });
  }
  if (dropped) warnings.push(`${dropped} point(s) ignoré(s) : coordonnées manquantes ou invalides.`);
  if (points.length < 2) throw new GpxParseError("Moins de 2 points valides : impossible de tracer un parcours.");
  const missingEle = points.filter((p) => p.ele === null).length;
  if (missingEle) warnings.push(`${missingEle} point(s) sans altitude.`);

  const name = trks[0]?.name ?? gpx.metadata?.name ?? null;
  return { name: typeof name === "string" ? name : null, points, warnings };
}

/**
 * Computes distance, D+/D- and profile.
 * D+/D- use a hysteresis threshold (default 3 m) to filter GPS/barometric noise —
 * the raw sum of deltas strongly overestimates climb on real tracks.
 */
export function computeGpxStats(points: GpxPoint[], opts: { hysteresisM?: number } = {}): GpxStats {
  const threshold = opts.hysteresisM ?? 3;
  let distanceM = 0;
  const profile: ElevationSample[] = [];
  let withEle = 0;
  let minEle: number | null = null;
  let maxEle: number | null = null;

  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    if (i > 0) distanceM += haversineDistanceM(points[i - 1]!, p);
    if (p.ele !== null) {
      withEle++;
      profile.push({ distanceM, ele: p.ele });
      minEle = minEle === null ? p.ele : Math.min(minEle, p.ele);
      maxEle = maxEle === null ? p.ele : Math.max(maxEle, p.ele);
    }
  }

  const coverage = points.length ? withEle / points.length : 0;
  let ascentM: number | null = null;
  let descentM: number | null = null;
  if (profile.length >= 2 && coverage >= 0.8) {
    ascentM = 0;
    descentM = 0;
    let ref = profile[0]!.ele;
    for (const s of profile) {
      const d = s.ele - ref;
      if (d >= threshold) { ascentM += d; ref = s.ele; }
      else if (d <= -threshold) { descentM += -d; ref = s.ele; }
    }
  }

  return {
    pointCount: points.length,
    distanceM,
    ascentM,
    descentM,
    minEle,
    maxEle,
    elevationCoverage: coverage,
    profile,
    start: points[0] ?? null,
    end: points[points.length - 1] ?? null,
  };
}
