#!/usr/bin/env node
// DEVELOPMENT ONLY — protocol test double for dfs-bridge/1. It does not control any aircraft and
// emits synthetic telemetry flagged as such ("bridge.platform = test"). Used by E2E tests.
// Usage: node tools/test-bridge.mjs [port] [profileId]
import { WebSocketServer } from "ws";
const port = Number(process.argv[2] ?? 8765), profileId = process.argv[3] ?? "dji-mini-4-pro";
const wss = new WebSocketServer({ host: "127.0.0.1", port });
wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ type: "hello", protocol: "dfs-bridge/1", bridge: { name: "test-bridge", version: "0.0.0", platform: "test" },
    sdk: { name: "TEST (aucun SDK)", version: "0" }, aircraft: { model: "Appareil de test", profileId }, capabilities: ["telemetry", "mission", "waypoint"],
    limits: { maxWaypoints: 99, maxHeightM: 120 }, requiresManualTakeoff: true }));
  let timer = null, progress = 0, state = "idle";
  const status = (s, extra = {}) => { state = s; ws.send(JSON.stringify({ type: "mission-status", state: s, ...extra })); };
  ws.on("message", (raw) => {
    const m = JSON.parse(String(raw));
    if (m.type === "subscribe-telemetry") timer = setInterval(() => ws.send(JSON.stringify({ type: "telemetry", timestamp: Date.now(), lat: 45.9325, lon: 6.8365, takeoffRelativeHeightM: 12, headingDeg: 90, groundSpeedMs: 0, batteryPercent: 87, gpsSatellites: 14, flightMode: "TEST" })), 500);
    if (m.type === "upload-mission") { status("uploading"); setTimeout(() => status("ready", { message: `${m.mission.waypoints.length} waypoints reçus (test)` }), 300); }
    if (m.type === "start-mission" && state === "ready") { progress = 0; status("running", { progress }); }
    if (m.type === "pause-mission" && state === "running") status("paused", { progress });
    if (m.type === "resume-mission" && state === "paused") status("running", { progress });
    if (m.type === "stop-mission") status("aborted", { message: "Arrêt demandé (test)" });
  });
  ws.on("close", () => clearInterval(timer));
});
console.log(`[test-bridge] ws://127.0.0.1:${port} (${profileId}) — test double, no aircraft`);
