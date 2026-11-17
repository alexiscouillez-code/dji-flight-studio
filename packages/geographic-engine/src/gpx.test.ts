import { describe, expect, it } from "vitest";
import { computeGpxStats, GpxParseError, parseGpx } from "./gpx";

const gpx = (pts: string) => `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Test</name><trkseg>${pts}</trkseg></trk></gpx>`;

describe("parseGpx", () => {
  it("parses track points with elevation", () => {
    const t = parseGpx(gpx(`<trkpt lat="45.9" lon="6.87"><ele>1000</ele></trkpt><trkpt lat="45.91" lon="6.87"><ele>1100</ele></trkpt>`));
    expect(t.name).toBe("Test");
    expect(t.points).toHaveLength(2);
    expect(t.points[1]!.ele).toBe(1100);
    expect(t.warnings).toEqual([]);
  });
  it("drops invalid points and warns about missing elevation", () => {
    const t = parseGpx(gpx(`<trkpt lat="45.9" lon="6.87"/><trkpt lat="abc" lon="6.87"/><trkpt lat="45.91" lon="6.87"><ele>1</ele></trkpt>`));
    expect(t.points).toHaveLength(2);
    expect(t.warnings.join(" ")).toMatch(/1 point\(s\) ignoré/);
    expect(t.warnings.join(" ")).toMatch(/sans altitude/);
  });
  it("falls back to routes", () => {
    const t = parseGpx(`<gpx><rte><rtept lat="1" lon="1"/><rtept lat="1.1" lon="1"/></rte></gpx>`);
    expect(t.points).toHaveLength(2);
  });
  it("rejects non-GPX and empty files", () => {
    expect(() => parseGpx("hello")).toThrow(GpxParseError);
    expect(() => parseGpx(gpx(""))).toThrow(GpxParseError);
  });
});

describe("computeGpxStats", () => {
  it("computes distance and D+/D- with hysteresis", () => {
    const eles = [1000, 1001, 1000, 1010, 1020, 1015, 1005];
    const pts = eles.map((ele, i) => ({ lat: 45 + i * 0.001, lon: 6, ele, time: null }));
    const s = computeGpxStats(pts);
    expect(s.distanceM).toBeCloseTo(6 * 111.195, 0);
    expect(s.ascentM).toBe(20); // 1000→1010→1020 (1 m noise ignored)
    expect(s.descentM).toBe(15);
    expect(s.minEle).toBe(1000);
    expect(s.maxEle).toBe(1020);
  });
  it("refuses to invent D+ when elevation coverage is too low", () => {
    const pts = [0, 1, 2, 3, 4].map((i) => ({ lat: 45 + i * 0.001, lon: 6, ele: i === 0 ? 100 : null, time: null }));
    const s = computeGpxStats(pts);
    expect(s.ascentM).toBeNull();
    expect(s.elevationCoverage).toBeCloseTo(0.2);
  });
});
