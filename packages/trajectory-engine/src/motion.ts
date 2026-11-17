/**
 * Trapezoidal (or triangular) speed profile over a distance — used to estimate
 * segment durations. This is a planning model, not a model of a real aircraft.
 */
export function trapezoidDuration(distanceM: number, cruiseMs: number, accelMs2: number): { durationS: number; peakMs: number } {
  if (distanceM <= 0) return { durationS: 0, peakMs: 0 };
  if (cruiseMs <= 0 || accelMs2 <= 0) throw new RangeError("cruise speed and acceleration must be > 0");
  const dAccel = (cruiseMs * cruiseMs) / (2 * accelMs2);
  if (2 * dAccel >= distanceM) {
    const peak = Math.sqrt(accelMs2 * distanceM);
    return { durationS: (2 * peak) / accelMs2, peakMs: peak };
  }
  return { durationS: 2 * (cruiseMs / accelMs2) + (distanceM - 2 * dAccel) / cruiseMs, peakMs: cruiseMs };
}
