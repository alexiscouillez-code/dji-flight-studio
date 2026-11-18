import { describe, expect, it } from "vitest";
import { createIonGeocoder, createNominatimGeocoder } from "./providers";

const fakeFetch = (body: unknown, ok = true, status = 200) => async (url: string) => {
  (fakeFetch as any).last = url;
  return { ok, status, json: async () => body };
};

describe("geocoders", () => {
  it("parses Cesium ion GeoJSON and drops invalid features", async () => {
    const g = createIonGeocoder("TOKEN", fakeFetch({ features: [
      { properties: { label: "Chamonix, France" }, geometry: { coordinates: [6.87, 45.92] }, bbox: [6.8, 45.9, 6.9, 45.95] },
      { properties: { label: "bad" }, geometry: { coordinates: [500, 0] } },
    ] }));
    const r = await g.search("Chamonix");
    expect((fakeFetch as any).last).toMatch(/geocoder=google/);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ label: "Chamonix, France", lat: 45.92, lon: 6.87, bbox: [6.8, 45.9, 6.9, 45.95] });
  });
  it("parses Nominatim and reorders the bounding box to W,S,E,N", async () => {
    const g = createNominatimGeocoder(fakeFetch([{ display_name: "Mont Blanc", lat: "45.8326", lon: "6.8652", boundingbox: ["45.8", "45.9", "6.8", "6.9"] }]));
    const r = await g.search("Mont Blanc");
    expect(r[0]).toMatchObject({ lat: 45.8326, lon: 6.8652, bbox: [6.8, 45.8, 6.9, 45.9] });
  });
  it("surfaces HTTP errors and ignores empty queries", async () => {
    await expect(createNominatimGeocoder(fakeFetch([], false, 429)).search("x")).rejects.toThrow(/429/);
    expect(await createIonGeocoder("T", fakeFetch({})).search("  ")).toEqual([]);
  });
});
