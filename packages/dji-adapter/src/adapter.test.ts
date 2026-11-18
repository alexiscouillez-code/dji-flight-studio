import { describe, expect, it, vi } from "vitest";
import { DJI_MINI_4_PRO, DJI_NEO_2 } from "@dfs/drone-adapters";
import { BridgeClient, compileMission, isEnabled, missionToGeoJson, missionToGpx, negotiate, parseIncoming, PROTOCOL, type Hello, type Transport } from "./index";

const hello = (over: Partial<Hello> = {}): Hello => ({
  type: "hello", protocol: PROTOCOL, bridge: { name: "test", version: "0", platform: "test" }, sdk: { name: "DJI MSDK", version: "5.13.0" },
  aircraft: { model: "DJI Mini 4 Pro", profileId: "dji-mini-4-pro" }, capabilities: ["telemetry", "mission"], limits: {}, requiresManualTakeoff: true, ...over,
});

function fakeTransport() {
  let onMsg: (d: string) => void = () => {}, onClose: (r: string) => void = () => {};
  const sent: string[] = [];
  const t: Transport = { send: (d) => sent.push(d), close: () => onClose("closed"), onMessage: (cb) => { onMsg = cb; }, onClose: (cb) => { onClose = cb; } };
  return { t, sent, push: (o: unknown) => onMsg(JSON.stringify(o)), pushRaw: (s: string) => onMsg(s) };
}

describe("protocol", () => {
  it("rejects bridges that would take off automatically or speak another protocol", () => {
    expect(parseIncoming(JSON.stringify({ ...hello(), requiresManualTakeoff: false })).ok).toBe(false);
    expect(parseIncoming(JSON.stringify({ ...hello(), protocol: "x/2" })).ok).toBe(false);
    expect(parseIncoming("not json").ok).toBe(false);
    expect(parseIncoming(JSON.stringify(hello())).ok).toBe(true);
  });
});

describe("negotiate", () => {
  it("Neo 2: nothing enabled even if a bridge claims it", () => {
    const caps = negotiate(DJI_NEO_2, hello({ aircraft: { model: "DJI Neo 2", profileId: "dji-neo-2" }, capabilities: ["telemetry", "mission"] }));
    expect(caps.every((c) => !c.enabled)).toBe(true);
  });
  it("Mini 4 Pro: only what the bridge declares, with pilot acknowledgement (unverified hardware)", () => {
    const caps = negotiate(DJI_MINI_4_PRO, hello());
    expect(isEnabled(caps, "telemetry")).toBe(true);
    expect(isEnabled(caps, "mission")).toBe(true);
    expect(isEnabled(caps, "camera")).toBe(false);
    expect(caps.find((c) => c.capability === "mission")!.needsAck).toBe(true);
  });
  it("aircraft mismatch disables everything", () => {
    const caps = negotiate(DJI_MINI_4_PRO, hello({ aircraft: { model: "Matrice 30", profileId: "dji-matrice-30" } }));
    expect(caps.every((c) => !c.enabled)).toBe(true);
    expect(caps[0]!.reason).toMatch(/différent/);
  });
  it("no bridge → disabled", () => {
    expect(negotiate(DJI_MINI_4_PRO, null).every((c) => !c.enabled)).toBe(true);
  });
});

describe("BridgeClient", () => {
  it("handshake, telemetry, invalid messages and timeout", () => {
    vi.useFakeTimers();
    const f = fakeTransport();
    const events: string[] = [];
    const c = new BridgeClient(f.t, { state: (s) => events.push(s), invalid: () => events.push("invalid"), telemetry: () => events.push("tel") });
    f.push({ type: "telemetry", timestamp: 1, lat: 45, lon: 6, takeoffRelativeHeightM: 10, headingDeg: 0, groundSpeedMs: 1 });
    expect(events).toContain("invalid"); // before handshake
    f.push(hello());
    expect(c.state).toBe("connected");
    expect(JSON.parse(f.sent[0]!).type).toBe("hello-ack");
    f.push({ type: "telemetry", timestamp: 2, lat: 45, lon: 6, takeoffRelativeHeightM: 10, headingDeg: 0, groundSpeedMs: 1 });
    f.pushRaw("{bad");
    expect(events.filter((e) => e === "tel")).toHaveLength(1);
    expect(c.lastTelemetry?.timestamp).toBe(2);
    const f2 = fakeTransport();
    const c2 = new BridgeClient(f2.t, {}, 1000);
    vi.advanceTimersByTime(1100);
    expect(c2.state).toBe("error");
    vi.useRealTimers();
  });
  it("refuses to send commands when not connected", () => {
    const f = fakeTransport();
    const c = new BridgeClient(f.t);
    expect(() => c.send({ type: "start-mission" })).toThrow();
  });
});

describe("compileMission", () => {
  const samples = Array.from({ length: 101 }, (_, i) => ({ t: i / 10, drone: { x: 0, y: i * 0.5, z: 20 + i * 0.1 }, camera: { headingDeg: 0, pitchDeg: -20 } }));
  const base = { projectId: "p", profileId: "dji-mini-4-pro", toGeo: (p: { x: number; y: number; z: number }) => ({ lat: 45 + p.y / 111000, lon: 6, h: 2000 + p.z }), takeoffZ: 0, now: () => "2026-11-18T00:00:00.000Z" };
  it("decimates every 2 s and keeps endpoints; computes take-off-relative heights", () => {
    const m = compileMission(samples, base);
    expect(m.waypoints).toHaveLength(6);
    expect(m.waypoints[0]!.heightM).toBeCloseTo(20);
    expect(m.waypoints[5]!.heightM).toBeCloseTo(30);
    expect(m.waypoints[0]!.speedMs).toBeCloseTo(Math.hypot(10, 2) / 2, 3);
    expect(m.blocked).toBe(false);
    expect(m.manualTakeoff).toBe(true);
  });
  it("blocks instead of clamping when limits are exceeded", () => {
    const m = compileMission(samples, { ...base, maxHeightM: 25, maxSpeedMs: 2 });
    expect(m.blocked).toBe(true);
    expect(m.issues.filter((i) => i.level === "technical-block")).toHaveLength(2);
  });
  it("exports GPX (escaped, no ele) and GeoJSON with explicit height references", () => {
    const m = compileMission(samples, base);
    const gpx = missionToGpx(m, "Crête <test>");
    expect(gpx).toMatch(/&lt;test&gt;/);
    expect(gpx).not.toMatch(/<ele>/);
    expect((gpx.match(/<rtept/g) ?? []).length).toBe(6);
    const gj = missionToGeoJson(m, "x");
    expect(gj.features).toHaveLength(7);
    expect(gj.properties.heightReference).toMatch(/ellipsoid/);
  });
});
