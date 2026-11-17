import { describe, expect, it } from "vitest";
import { parseCoordinates } from "./coordinates";

describe("parseCoordinates", () => {
  it.each([
    ["45.8326, 6.8652", 45.8326, 6.8652],
    ["45.8326 6.8652", 45.8326, 6.8652],
    ["45,8326; 6,8652", 45.8326, 6.8652],
    ["-33.8568,151.2153", -33.8568, 151.2153],
    [`45°49'57"N 6°51'55"E`, 45.8325, 6.8653],
    [`40°41'21"N 74°2'40"W`, 40.6892, -74.0444],
  ])("%s", (input, lat, lon) => {
    const r = parseCoordinates(input)!;
    expect(r.lat).toBeCloseTo(lat, 3);
    expect(r.lon).toBeCloseTo(lon, 3);
  });
  it.each(["Chamonix", "", "95, 10", "45.1"])("rejette %s", (s) => {
    expect(parseCoordinates(s)).toBeNull();
  });
});
