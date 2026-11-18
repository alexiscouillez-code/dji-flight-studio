"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Download, Pause, Play, Plug, PlugZap, Smartphone, Square, Upload } from "lucide-react";
import { DRONE_PROFILES } from "@dfs/drone-adapters";
import {
  BridgeClient, compileMission, isEnabled, missionToGeoJson, missionToGpx, negotiate, webSocketTransport,
  type BridgeState, type DfsMission, type Hello, type MissionStatus, type TelemetryMsg,
} from "@dfs/dji-adapter";
import { formatLatLon } from "@dfs/geographic-engine";
import { PageHeader } from "@/components/PageHeader";
import { ProjectPicker } from "@/components/workspace/Kit";
import { computePlan } from "@/lib/plan";
import { downloadText, slugify, withHistory } from "@/lib/projects";
import { useActiveProject } from "@/lib/useActiveProject";
import { useStudio } from "@/lib/store";
import { ProfileCard } from "./ProfileCard";

const DEFAULT_URL = "ws://127.0.0.1:8765";

export function DroneConnection() {
  const { save } = useStudio();
  const { active, project, projectId, setProjectId } = useActiveProject();
  const [profileId, setProfileId] = useState("dji-neo-2");
  useEffect(() => { if (project) setProfileId(project.droneProfileId); }, [project?.id, project?.droneProfileId]); // eslint-disable-line react-hooks/exhaustive-deps
  const profile = DRONE_PROFILES[profileId] ?? DRONE_PROFILES["dji-neo-2"]!;

  // ---- bridge ----
  const [url, setUrl] = useState(DEFAULT_URL);
  const [state, setState] = useState<BridgeState>("disconnected");
  const [detail, setDetail] = useState<string | null>(null);
  const [hello, setHello] = useState<Hello | null>(null);
  const [tel, setTel] = useState<TelemetryMsg | null>(null);
  const [mstatus, setMstatus] = useState<MissionStatus | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const client = useRef<BridgeClient | null>(null);
  const addLog = (l: string) => setLog((x) => [`${new Date().toLocaleTimeString("fr-FR")} ${l}`, ...x].slice(0, 30));
  useEffect(() => () => client.current?.close(), []);

  function connect() {
    try {
      client.current?.close();
      setHello(null); setTel(null); setMstatus(null); setDetail(null);
      client.current = new BridgeClient(webSocketTransport(url), {
        state: (s, d) => { setState(s); if (d) setDetail(d); if (s !== "connected") setHello(null); },
        hello: (h) => { setHello(h); addLog(`Pont ${h.bridge.name} ${h.bridge.version} · ${h.sdk.name} ${h.sdk.version} · ${h.aircraft?.model ?? "aucun appareil"}`); },
        telemetry: setTel,
        missionStatus: (m) => { setMstatus(m); addLog(`Mission : ${m.state}${m.message ? ` — ${m.message}` : ""}`); },
        invalid: (e) => addLog(`Message ignoré : ${e}`),
        bridgeError: (c, m) => addLog(`Erreur pont ${c} : ${m}`),
      });
    } catch (e) { setState("error"); setDetail((e as Error).message); }
  }
  const caps = useMemo(() => negotiate(profile, hello), [profile, hello]);
  useEffect(() => { if (hello && isEnabled(caps, "telemetry")) client.current?.send({ type: "subscribe-telemetry", hz: 2 }); }, [hello, caps]);

  // ---- mission ----
  const plan = useMemo(() => (project ? computePlan(project) : null), [project]);
  const [interval, setIntervalS] = useState(2);
  const mission: DfsMission | null = useMemo(() => {
    if (!project || !plan) return null;
    return compileMission(plan.samples, {
      projectId: project.id, profileId: profile.id, toGeo: plan.frame.toGeo, takeoffZ: plan.frame.takeoff.z, intervalS: interval,
      maxWaypoints: hello?.limits.maxWaypoints ?? 200, maxHeightM: Math.min(120, hello?.limits.maxHeightM ?? 120), maxSpeedMs: hello?.limits.maxSpeedMs ?? project.simulation.maxSpeedMs,
    });
  }, [project, plan, profile.id, interval, hello]);
  const [ack, setAck] = useState(false);
  const [confirmStart, setConfirmStart] = useState(false);
  const missionCap = caps.find((c) => c.capability === "mission")!;
  const canUpload = Boolean(mission && !mission.blocked && missionCap.enabled && (!missionCap.needsAck || ack));
  const send = (m: Parameters<BridgeClient["send"]>[0], label: string) => {
    try { client.current?.send(m); addLog(label); } catch (e) { addLog((e as Error).message); }
  };
  async function upload() {
    if (!mission || !project) return;
    send({ type: "upload-mission", mission }, `Mission envoyée au pont (${mission.waypoints.length} waypoints).`);
    await save(withHistory(project, `Mission envoyée au pont (${profile.name})`)).catch(() => {});
  }
  const exportBase = project ? slugify(project.name) : "mission";
  const telAge = tel ? (Date.now() - tel.timestamp) / 1000 : null;

  return (
    <>
      <PageHeader eyebrow="Universal Drone Adapter" title="Drone Connection"
        description="Fiches de compatibilité sourcées, détection des capacités et pont matériel. Une fonction ne s'active que si le profil, le pont connecté et l'appareil détecté la prennent réellement en charge."
        actions={<Link href="/companion" className="btn btn-primary"><Smartphone size={16} />Neo 2 Companion<ArrowRight size={15} /></Link>} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="label" htmlFor="profile">Profil</label>
        <select id="profile" className="input h-9 w-auto" value={profileId} onChange={(e) => setProfileId(e.target.value)}>
          {Object.values(DRONE_PROFILES).map((p) => <option key={p.id} value={p.id}>{p.name} — {p.mode === "manual-companion" ? "Companion manuel" : "MSDK V5 (non vérifié)"}</option>)}
        </select>
        {project && project.droneProfileId !== profileId && <span className="text-xs text-warn">Différent du drone du projet ({DRONE_PROFILES[project.droneProfileId]?.name}).</span>}
      </div>
      <ProfileCard p={profile} />

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {/* Bridge */}
        <section className="panel space-y-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="label">Pont matériel (protocole dfs-bridge/1)</h2>
            <span className={`tag ${state === "connected" ? "tag-ok" : state === "error" ? "tag-danger" : ""}`}>{state === "connected" ? "Connecté" : state === "connecting" ? "Connexion…" : state === "error" ? "Erreur" : "Aucun pont connecté"}</span>
          </div>
          {profile.mode === "manual-companion" ? (
            <p className="text-sm text-muted">{profile.name} : aucun SDK officiel, donc aucun pont possible. Utilisez le <Link className="text-cyan hover:underline" href="/companion">Companion</Link>.</p>
          ) : (
            <>
              <p className="text-xs leading-relaxed text-muted">Le pont est une application Android (DJI MSDK V5) lancée sur le téléphone relié à la radiocommande. Elle expose ce que le SDK permet réellement ; la page s'y connecte en local. Aucune application pont n'est encore publiée : cette connexion attend l'adaptateur natif (voir la documentation du protocole).</p>
              <div className="flex gap-2">
                <input className="input mono h-9 text-xs" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Adresse du pont" />
                {state === "connected" || state === "connecting"
                  ? <button className="btn h-9" onClick={() => client.current?.close()}><PlugZap size={15} />Déconnecter</button>
                  : <button className="btn btn-primary h-9" onClick={connect}><Plug size={15} />Connecter</button>}
              </div>
              {detail && state !== "connected" && <p className="text-xs text-danger">{detail}</p>}
            </>
          )}
          <div>
            <div className="label mb-2">Capacités effectives</div>
            <ul className="space-y-1.5 text-xs">{caps.map((c) => (
              <li key={c.capability} className="flex items-start gap-2">
                <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${c.enabled ? (c.needsAck ? "bg-warn" : "bg-ok") : "bg-faint"}`} />
                <span><span className={c.enabled ? "text-text" : "text-muted"}>{c.label}</span> <span className="text-faint">— {c.reason}</span></span>
              </li>
            ))}</ul>
          </div>
          {hello && isEnabled(caps, "telemetry") && (
            <div className="rounded-lg border border-line bg-bg/40 p-3 text-xs">
              <div className="label mb-1.5">Télémétrie (source : pont, {hello.sdk.name})</div>
              {tel ? (
                <div className="mono grid grid-cols-2 gap-1">
                  <span>{formatLatLon(tel, 5)}</span><span>H {tel.takeoffRelativeHeightM.toFixed(1)} m</span>
                  <span>Cap {tel.headingDeg.toFixed(0)}°</span><span>{tel.groundSpeedMs.toFixed(1)} m/s</span>
                  {tel.batteryPercent !== undefined && <span>Batterie {tel.batteryPercent}%</span>}
                  {tel.gpsSatellites !== undefined && <span>GPS {tel.gpsSatellites} sat.</span>}
                  <span className={telAge !== null && telAge > 3 ? "text-warn" : "text-faint"}>{telAge !== null && telAge > 3 ? `Données anciennes (${telAge.toFixed(0)} s)` : "à jour"}</span>
                </div>
              ) : <p className="text-faint">En attente de données…</p>}
            </div>
          )}
          {log.length > 0 && <details className="text-[11px] text-faint"><summary className="cursor-pointer">Journal ({log.length})</summary><ul className="mono mt-1 space-y-0.5">{log.map((l, i) => <li key={i}>{l}</li>)}</ul></details>}
        </section>

        {/* Mission */}
        <section className="panel space-y-4 p-5">
          <h2 className="label">Mission depuis le plan de tournage</h2>
          <ProjectPicker active={active} projectId={projectId} onChange={setProjectId} />
          {!project ? null : !plan ? (
            <p className="text-sm text-muted">Placez le décollage et le sujet puis composez la <Link className="text-cyan hover:underline" href="/timeline">Timeline</Link>.</p>
          ) : mission && (
            <>
              <label className="block text-xs text-muted">Un waypoint toutes les
                <select className="input ml-2 inline-block h-8 w-auto text-xs" value={interval} onChange={(e) => setIntervalS(Number(e.target.value))}>
                  {[1, 2, 3, 5].map((v) => <option key={v} value={v}>{v} s</option>)}
                </select>
                <span className="ml-2 text-faint">(+ changements de cap)</span>
              </label>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-lg border border-line bg-bg/40 p-2"><div className="text-faint">Waypoints</div><div className="mono text-sm">{mission.waypoints.length}</div></div>
                <div className="rounded-lg border border-line bg-bg/40 p-2"><div className="text-faint">H max</div><div className="mono text-sm">{Math.max(...mission.waypoints.map((w) => w.heightM)).toFixed(0)} m</div></div>
                <div className="rounded-lg border border-line bg-bg/40 p-2"><div className="text-faint">Vitesse max</div><div className="mono text-sm">{Math.max(...mission.waypoints.map((w) => w.speedMs)).toFixed(1)} m/s</div></div>
              </div>
              <ul className="space-y-1">{mission.issues.map((i) => <li key={i.message} className={`text-xs ${i.level === "technical-block" ? "text-danger" : "text-warn"}`}>{i.level === "technical-block" ? "Blocage : " : ""}{i.message}</li>)}</ul>
              <div className="flex flex-wrap gap-2">
                <button className="btn h-9 text-xs" onClick={() => downloadText(`${exportBase}.gpx`, missionToGpx(mission, project.name), "application/gpx+xml")}><Download size={14} />GPX</button>
                <button className="btn h-9 text-xs" onClick={() => downloadText(`${exportBase}.geojson`, JSON.stringify(missionToGeoJson(mission, project.name), null, 2), "application/geo+json")}><Download size={14} />GeoJSON</button>
                <button className="btn h-9 text-xs" onClick={() => downloadText(`${exportBase}.dfs-mission.json`, JSON.stringify(mission, null, 2))}><Download size={14} />Mission JSON</button>
              </div>

              <div className="space-y-2 border-t border-line pt-3">
                <div className="label">Exécution automatisée</div>
                {!missionCap.enabled ? <p className="text-xs text-muted">Indisponible : {missionCap.reason}</p> : (
                  <>
                    {missionCap.needsAck && (
                      <label className="flex items-start gap-2 text-xs text-warn">
                        <input type="checkbox" className="mt-0.5 accent-[var(--color-warn)]" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                        Ce couple appareil / pont n'a pas été validé par DJI FLIGHT STUDIO. Je décolle moi-même, je garde le drone en vue et je reprends la main à la radiocommande à tout moment.
                      </label>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button className="btn h-9 text-xs" disabled={!canUpload} onClick={upload}><Upload size={14} />Envoyer au pont</button>
                      {confirmStart ? (
                        <>
                          <button className="btn btn-primary h-9 text-xs" disabled={mstatus?.state !== "ready"} onClick={() => { send({ type: "start-mission" }, "Démarrage demandé."); setConfirmStart(false); }}>Confirmer : drone en vol, zone dégagée</button>
                          <button className="btn h-9 text-xs" onClick={() => setConfirmStart(false)}>Annuler</button>
                        </>
                      ) : <button className="btn h-9 text-xs" disabled={mstatus?.state !== "ready"} onClick={() => setConfirmStart(true)}><Play size={14} />Démarrer</button>}
                      <button className="btn h-9 text-xs" disabled={mstatus?.state !== "running"} onClick={() => send({ type: "pause-mission" }, "Pause demandée.")}><Pause size={14} />Pause</button>
                      <button className="btn h-9 text-xs" disabled={mstatus?.state !== "paused"} onClick={() => send({ type: "resume-mission" }, "Reprise demandée.")}><Play size={14} />Reprendre</button>
                      <button className="btn btn-danger h-9 text-xs" disabled={!mstatus || !["running", "paused", "ready"].includes(mstatus.state)} onClick={() => send({ type: "stop-mission" }, "Arrêt demandé.")}><Square size={14} />Arrêter</button>
                    </div>
                    {mstatus && <p className="text-xs text-muted">État : <b>{mstatus.state}</b>{mstatus.progress !== undefined ? ` · ${Math.round(mstatus.progress * 100)} %` : ""}{mstatus.message ? ` — ${mstatus.message}` : ""}</p>}
                    <p className="text-[10.5px] text-faint">Pas de décollage automatique : le pont refuse toute mission tant que l'appareil n'est pas en vol piloté. La radiocommande garde la priorité.</p>
                  </>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}
