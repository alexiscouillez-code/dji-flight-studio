import { describe, expect, it } from "vitest";
import { createEnuFrame, haversineDistanceM, initialBearingDeg, ecefToGeodetic, geodeticToEcef } from "./geodesy";

const chamonix = { lat: 45.9237, lon: 6.8694 };
const montBlanc = { lat: 45.8326, lon: 6.8652 };

describe("geodesy", () => {
  it("haversine: Paris→Londres ≈ 343.5 km", () => {
    const d = haversineDistanceM({ lat: 48.8566, lon: 2.3522 }, { lat: 51.5074, lon: -0.1278 });
    expect(d / 1000).toBeCloseTo(343.5, 0);
  });
  it("haversine: 1° de latitude ≈ 111.2 km", () => {
    expect(haversineDistanceM({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(111195, -1);
  });
  it("bearing: Chamonix → Mont Blanc est quasi plein sud", () => {
    const b = initialBearingDeg(chamonix, montBlanc);
    expect(b).toBeGreaterThan(180);
    expect(b).toBeLessThan(185);
  });
  it("ECEF round-trip < 1 mm", () => {
    const back = ecefToGeodetic(geodeticToEcef(montBlanc, 4805));
    expect(back.lat).toBeCloseTo(montBlanc.lat, 9);
    expect(back.lon).toBeCloseTo(montBlanc.lon, 9);
    expect(back.h).toBeCloseTo(4805, 3);
  });
  it("ENU: point 100 m au nord puis retour", () => {
    const f = createEnuFrame(chamonix, 1035);
    const north = f.fromEnu({ e: 0, n: 100, u: 0 });
    expect(haversineDistanceM(chamonix, north)).toBeCloseTo(100, 0);
    const enu = f.toEnu(north, north.h);
    expect(enu.n).toBeCloseTo(100, 6);
    expect(Math.abs(enu.e)).toBeLessThan(1e-6);
  });
});
