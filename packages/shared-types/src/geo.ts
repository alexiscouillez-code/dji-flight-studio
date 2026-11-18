import { z } from "zod";

/** WGS84 geographic coordinate, degrees. */
export const LatLonSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});
export type LatLon = z.infer<typeof LatLonSchema>;

/**
 * Altitude references — NEVER mix them (prompt §7.6).
 * - terrain_msl      : terrain elevation above mean sea level (from a DEM)
 * - terrain_wgs84    : terrain height above the WGS84 ellipsoid (Cesium terrain; differs from MSL by the geoid, ≈ +50 m in the Alps)
 * - drone_amsl       : absolute altitude of the drone above mean sea level
 * - takeoff_relative : height relative to the take-off point (what DJI Fly shows as "H")
 * - agl              : real height above the ground directly below
 * - virtual          : altitude of a virtual trajectory point in a non-georeferenced scene
 */
export const AltitudeReferenceSchema = z.enum([
  "terrain_msl",
  "terrain_wgs84",
  "drone_amsl",
  "takeoff_relative",
  "agl",
  "virtual",
]);
export type AltitudeReference = z.infer<typeof AltitudeReferenceSchema>;

export const ALTITUDE_REFERENCE_LABELS: Record<AltitudeReference, string> = {
  terrain_msl: "Altitude terrain (MSL)",
  terrain_wgs84: "Altitude terrain (ellipsoïde WGS84)",
  drone_amsl: "Altitude absolue drone (AMSL)",
  takeoff_relative: "Hauteur / point de décollage",
  agl: "Hauteur au-dessus du sol (AGL)",
  virtual: "Altitude trajectoire virtuelle",
};

export const AltitudeSchema = z.object({
  valueM: z.number().finite(),
  reference: AltitudeReferenceSchema,
  /** Where the value comes from, e.g. "gpx", "cesium-world-terrain", "user". */
  source: z.string().min(1),
  /** Estimated vertical accuracy (1σ, metres) when known. */
  accuracyM: z.number().positive().optional(),
});
export type Altitude = z.infer<typeof AltitudeSchema>;

export const GeoPointSchema = LatLonSchema.extend({
  altitude: AltitudeSchema.optional(),
});
export type GeoPoint = z.infer<typeof GeoPointSchema>;
