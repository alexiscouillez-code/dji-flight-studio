/**
 * Interchangeable geographic providers (prompt §7.3, §7.4).
 * Each provider declares its licence constraints; the UI must display attribution
 * and must never cache tiles offline unless `offlineAllowed` is true.
 */
export interface ProviderInfo {
  id: string;
  label: string;
  kind: "imagery" | "terrain" | "geocoder";
  requiresToken: boolean;
  attribution: string;
  licenceUrl: string;
  offlineAllowed: boolean;
  notes: string;
}

export const PROVIDERS: Record<string, ProviderInfo> = {
  "ion-world-terrain": {
    id: "ion-world-terrain", label: "Cesium World Terrain", kind: "terrain", requiresToken: true,
    attribution: "Cesium ion", licenceUrl: "https://cesium.com/legal/terms-of-service/", offlineAllowed: false,
    notes: "Relief mondial ; résolution variable selon les régions. Quota selon l'offre Cesium ion.",
  },
  "ion-aerial": {
    id: "ion-aerial", label: "Satellite (Bing Maps Aerial via Cesium ion)", kind: "imagery", requiresToken: true,
    attribution: "Microsoft / Cesium ion", licenceUrl: "https://cesium.com/legal/terms-of-service/", offlineAllowed: false,
    notes: "Imagerie streamée ; pas de stockage hors ligne.",
  },
  osm: {
    id: "osm", label: "Carte OpenStreetMap", kind: "imagery", requiresToken: false,
    attribution: "© OpenStreetMap contributors", licenceUrl: "https://operations.osmfoundation.org/policies/tiles/", offlineAllowed: false,
    notes: "Usage modéré uniquement (politique des tuiles OSMF), pas de téléchargement en masse.",
  },
  "ion-geocoder": {
    id: "ion-geocoder", label: "Cesium ion Geocoder", kind: "geocoder", requiresToken: true,
    attribution: "Cesium ion", licenceUrl: "https://cesium.com/legal/terms-of-service/", offlineAllowed: false,
    notes: "Recherche à la demande uniquement.",
  },
  nominatim: {
    id: "nominatim", label: "Nominatim (OpenStreetMap)", kind: "geocoder", requiresToken: false,
    attribution: "© OpenStreetMap contributors", licenceUrl: "https://operations.osmfoundation.org/policies/nominatim/", offlineAllowed: false,
    notes: "1 requête/s max, pas d'autocomplétion : recherche déclenchée par l'utilisateur uniquement.",
  },
};

export interface GeocodeResult {
  label: string;
  lat: number;
  lon: number;
  /** [west, south, east, north] degrees, when provided. */
  bbox: [number, number, number, number] | null;
  source: string;
}

export interface GeocoderAdapter {
  readonly info: ProviderInfo;
  search(query: string, signal?: AbortSignal): Promise<GeocodeResult[]>;
}

type FetchLike = (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN);
const validLatLon = (lat: number, lon: number) => Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

export function createIonGeocoder(token: string, fetchFn: FetchLike): GeocoderAdapter {
  return {
    info: PROVIDERS["ion-geocoder"]!,
    async search(query, signal) {
      const q = query.trim();
      if (!q) return [];
      const url = `https://api.cesium.com/v1/geocode/search?text=${encodeURIComponent(q)}&access_token=${encodeURIComponent(token)}`;
      const res = await fetchFn(url, { signal });
      if (!res.ok) throw new Error(`Géocodage Cesium indisponible (HTTP ${res.status}).`);
      const body = (await res.json()) as { features?: unknown[] };
      const out: GeocodeResult[] = [];
      for (const f of body.features ?? []) {
        const feat = f as { properties?: { label?: unknown }; geometry?: { coordinates?: unknown[] }; bbox?: unknown[] };
        const lon = num(feat.geometry?.coordinates?.[0]);
        const lat = num(feat.geometry?.coordinates?.[1]);
        if (!validLatLon(lat, lon)) continue;
        const b = feat.bbox?.map(num);
        out.push({
          label: String(feat.properties?.label ?? `${lat}, ${lon}`),
          lat, lon,
          bbox: b && b.length === 4 && b.every(Number.isFinite) ? [b[0]!, b[1]!, b[2]!, b[3]!] : null,
          source: "Cesium ion",
        });
      }
      return out;
    },
  };
}

export function createNominatimGeocoder(fetchFn: FetchLike): GeocoderAdapter {
  return {
    info: PROVIDERS.nominatim!,
    async search(query, signal) {
      const q = query.trim();
      if (!q) return [];
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&accept-language=fr&q=${encodeURIComponent(q)}`;
      const res = await fetchFn(url, { signal });
      if (!res.ok) throw new Error(`Géocodage OpenStreetMap indisponible (HTTP ${res.status}).`);
      const body = (await res.json()) as unknown[];
      const out: GeocodeResult[] = [];
      for (const r of Array.isArray(body) ? body : []) {
        const row = r as { display_name?: unknown; lat?: unknown; lon?: unknown; boundingbox?: unknown[] };
        const lat = num(row.lat), lon = num(row.lon);
        if (!validLatLon(lat, lon)) continue;
        const bb = row.boundingbox?.map(num); // [south, north, west, east]
        out.push({
          label: String(row.display_name ?? `${lat}, ${lon}`),
          lat, lon,
          bbox: bb && bb.length === 4 && bb.every(Number.isFinite) ? [bb[2]!, bb[0]!, bb[3]!, bb[1]!] : null,
          source: "OpenStreetMap Nominatim",
        });
      }
      return out;
    },
  };
}
