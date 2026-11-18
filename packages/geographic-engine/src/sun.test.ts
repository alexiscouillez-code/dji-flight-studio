import { describe, expect, it } from "vitest";
import { sunPosition, sunTimes } from "./sun";

const minutes = (a: Date, iso: string) => Math.abs(a.getTime() - new Date(iso).getTime()) / 60000;

describe("sun", () => {
  it("Paris, summer solstice: sunrise ≈ 03:47 UTC, sunset ≈ 19:58 UTC", () => {
    const t = sunTimes(new Date("2026-06-21T12:00:00Z"), 48.8566, 2.3522);
    expect(minutes(t.sunrise!, "2026-06-21T03:47:00Z")).toBeLessThan(4);
    expect(minutes(t.sunset!, "2026-06-21T19:58:00Z")).toBeLessThan(4);
    expect(t.goldenHourEvening!.getTime()).toBeLessThan(t.sunset!.getTime());
  });
  it("sun is high at solar noon in summer and below the horizon at midnight", () => {
    const noon = sunTimes(new Date("2026-06-21T12:00:00Z"), 45.92, 6.87).solarNoon;
    expect(sunPosition(noon, 45.92, 6.87).altitudeDeg).toBeGreaterThan(60);
    expect(Math.abs(sunPosition(noon, 45.92, 6.87).azimuthDeg - 180)).toBeLessThan(3);
    expect(sunPosition(new Date("2026-06-21T23:30:00Z"), 45.92, 6.87).altitudeDeg).toBeLessThan(0);
  });
  it("polar night → no sunrise", () => {
    expect(sunTimes(new Date("2026-12-21T12:00:00Z"), 78.2, 15.6).sunrise).toBeNull();
  });
});
