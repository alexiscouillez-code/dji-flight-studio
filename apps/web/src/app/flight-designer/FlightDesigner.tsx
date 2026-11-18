"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Clapperboard, MousePointerClick, Plus, Trash2 } from "lucide-react";
import type { LatLon, Project, Waypoint } from "@dfs/shared-types";
import { computeTrajectory, samplePath, type Vec3 } from "@dfs/trajectory-engine";
import { evaluateMission, LEVEL_ORDER } from "@dfs/flight-safety";
import { formatLatLon } from "@dfs/geographic-engine";
import { GlobeView, type GlobeHandle, type GlobeStatus, type PickMode } from "@/components/globe/GlobeView";
import { CheckItem } from "@/components/CheckItem";
import { NumberField, Panel, PickBanner, PlacementButtons, ProjectPicker, Stat, Toast } from "@/components/workspace/Kit";
import { buildSceneFrame, groundUnder, makeScenePoint } from "@/lib/scene";
import { withHistory } from "@/lib/projects";
import { getQuality } from "@/lib/quality";
import { useActiveProject } from "@/lib/useActiveProject";
import { useStudio } from "@/lib/store";
import { useSunTime } from "@/lib/useSunTime";
import { SunControl } from "@/components/globe/SunControl";
import { hasIonToken } from "@/lib/cesium";

const DS = "flight-designer";

export function FlightDesigner() {
  const { save } = useStudio();
  const { active, project, projectId, setProjectId } = useActiveProject();
  const globe = useRef<GlobeHandle>(null);
  const [status, setStatus] = useState<GlobeStatus | null>(null);
  const [pickMode, setPickMode] = useState<PickMode>(null);
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err" | "warn"; text: string } | null>(null);
  const [wps, setWps] = useState<Waypoint[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [clearance, setClearance] = useState<number | null | undefined>(undefined);
  const dirty = useRef(false);
  const [sunDate] = useSunTime();

  // local draft of the waypoints, saved with a debounce (one history entry per burst of edits)
  useEffect(() => { setWps(project?.waypoints ?? []); dirty.current = false; setSelected(null); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps
  const editWps = useCallback((fn: (w: Waypoint[]) => Waypoint[]) => { dirty.current = true; setWps(fn); }, []);
  useEffect(() => {
    if (!dirty.current || !project) return;
    const t = setTimeout(() => {
      dirty.current = false;
      save(withHistory({ ...project, waypoints: wps }, `Waypoints modifiés (${wps.length})`)).catch((e) => setMsg({ kind: "err", text: e.message }));
    }, 700);
    return () => clearTimeout(t);
  }, [wps, project, save]);

  const projectDraft: Project | null = useMemo(() => (project ? { ...project, waypoints: wps } : null), [project, wps]);
  const frame = useMemo(() => (projectDraft ? buildSceneFrame(projectDraft) : null), [projectDraft]);
  const traj = useMemo(() => { try { return projectDraft ? computeTrajectory(wps, { interpolation: projectDraft.interpolation }) : null; } catch { return null; } }, [projectDraft, wps]);
  const pathPts: Vec3[] = useMemo(() => (frame && frame.waypointPath.length >= 2 ? samplePath(frame.waypointPath, projectDraft!.interpolation, 16).flatMap((s, i) => (i ? s.slice(1) : s)) : frame?.waypointPath ?? []), [frame, projectDraft]);
  const checks = useMemo(() => (projectDraft ? evaluateMission(projectDraft).sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]) : []), [projectDraft]);

  // terrain clearance along the path
  useEffect(() => {
    if (!frame || pathPts.length < 2 || !status) { setClearance(undefined); return; }
    let cancel = false;
    const t = setTimeout(async () => {
      const g = await groundUnder(globe.current, frame, pathPts).catch(() => []);
      if (cancel) return;
      const vals = pathPts.flatMap((p, i) => (g[i] === null || g[i] === undefined ? [] : [p.z - g[i]!]));
      setClearance(vals.length ? Math.min(...vals) : null);
    }, 600);
    return () => { cancel = true; clearTimeout(t); };
  }, [frame, pathPts, status]);

  // ---- drawing ----
  useEffect(() => {
    const raw = globe.current?.raw();
    if (!raw || !frame) return;
    const { viewer, Cs } = raw;
    let ds = viewer.dataSources.getByName(DS)[0];
    if (!ds) { ds = new Cs.CustomDataSource(DS); void viewer.dataSources.add(ds); }
    ds.entities.removeAll();
    const toC = (p: Vec3) => { const g = frame.toGeo(p); return Cs.Cartesian3.fromDegrees(g.lon, g.lat, g.h); };
    if (pathPts.length >= 2) {
      ds.entities.add({ polyline: { positions: pathPts.map(toC), width: 3, material: new Cs.PolylineGlowMaterialProperty({ glowPower: 0.25, color: Cs.Color.fromCssColorString("#2ad4ee") }) } });
    }
    frame.waypointPath.forEach((p, i) => {
      const wp = wps.filter((w) => w.altitude.reference === "takeoff_relative")[i];
      if (!wp) return;
      const g = frame.toGeo(p);
      const sel = wp.id === selected;
      ds!.entities.add({
        id: `wp:${wp.id}`,
        position: Cs.Cartesian3.fromDegrees(g.lon, g.lat, g.h),
        point: { pixelSize: sel ? 16 : 12, color: Cs.Color.fromCssColorString(sel ? "#f5b84a" : "#2ad4ee"), outlineColor: Cs.Color.fromCssColorString("#06090f"), outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        label: { text: `${i + 1} · ${Math.round(wp.altitude.valueM)} m`, font: "600 11px system-ui", fillColor: Cs.Color.WHITE, showBackground: true, backgroundColor: Cs.Color.fromCssColorString("#06090fcc"), pixelOffset: new Cs.Cartesian2(0, -20), disableDepthTestDistance: Number.POSITIVE_INFINITY },
      });
      ds!.entities.add({ polyline: { positions: [Cs.Cartesian3.fromDegrees(g.lon, g.lat, g.h), Cs.Cartesian3.fromDegrees(g.lon, g.lat, frame.originH + frame.takeoff.z - 200)], width: 1, material: Cs.Color.fromCssColorString("#2ad4ee").withAlpha(0.35), depthFailMaterial: Cs.Color.TRANSPARENT } });
    });
    viewer.scene.requestRender();
  }, [frame, pathPts, wps, selected, status]);

  // ---- interaction: add + drag ----
  const addingRef = useRef(adding); addingRef.current = adding;
  const wpsRef = useRef(wps); wpsRef.current = wps;
  useEffect(() => {
    const raw = globe.current?.raw();
    if (!raw) return;
    const { viewer, Cs } = raw;
    const h = new Cs.ScreenSpaceEventHandler(viewer.scene.canvas);
    const groundAt = (pos: import("cesium").Cartesian2): LatLon | null => {
      const ray = viewer.camera.getPickRay(pos);
      const onMesh = !viewer.scene.globe.show && viewer.scene.pickPositionSupported ? viewer.scene.pickPosition(pos) : undefined;
      const c = onMesh ?? (ray && viewer.scene.globe.show ? viewer.scene.globe.pick(ray, viewer.scene) : undefined) ?? viewer.camera.pickEllipsoid(pos);
      if (!c) return null;
      const g = Cs.Cartographic.fromCartesian(c);
      return { lat: Cs.Math.toDegrees(g.latitude), lon: Cs.Math.toDegrees(g.longitude) };
    };
    let dragId: string | null = null;
    h.setInputAction((e: { position: import("cesium").Cartesian2 }) => {
      const picked = viewer.scene.pick(e.position) as { id?: { id?: string } } | undefined;
      const id = picked?.id?.id;
      if (typeof id === "string" && id.startsWith("wp:")) {
        dragId = id.slice(3);
        setSelected(dragId);
        viewer.scene.screenSpaceCameraController.enableInputs = false;
      }
    }, Cs.ScreenSpaceEventType.LEFT_DOWN);
    h.setInputAction((e: { endPosition: import("cesium").Cartesian2 }) => {
      if (!dragId) return;
      const p = groundAt(e.endPosition);
      if (p) { const id = dragId; editWps((ws) => ws.map((w) => (w.id === id ? { ...w, position: p } : w))); }
    }, Cs.ScreenSpaceEventType.MOUSE_MOVE);
    h.setInputAction(() => { if (dragId) { dragId = null; viewer.scene.screenSpaceCameraController.enableInputs = true; } }, Cs.ScreenSpaceEventType.LEFT_UP);
    h.setInputAction((e: { position: import("cesium").Cartesian2 }) => {
      if (!addingRef.current) return;
      const picked = viewer.scene.pick(e.position) as { id?: { id?: string } } | undefined;
      if (typeof picked?.id?.id === "string" && picked.id.id.startsWith("wp:")) return;
      const p = groundAt(e.position);
      if (!p) return;
      const last = wpsRef.current[wpsRef.current.length - 1];
      const wp: Waypoint = {
        id: crypto.randomUUID(), position: p,
        altitude: { valueM: last?.altitude.valueM ?? 30, reference: "takeoff_relative", source: "user" },
        speedMs: last?.speedMs ?? 5, pauseS: 0, cameraMode: "look-at-subject",
      };
      editWps((ws) => [...ws, wp]);
      setSelected(wp.id);
    }, Cs.ScreenSpaceEventType.LEFT_CLICK);
    return () => { h.destroy(); viewer.scene.screenSpaceCameraController.enableInputs = true; };
  }, [status, editWps]);

  async function onPick(mode: "takeoff" | "subject", p: LatLon) {
    setPickMode(null);
    if (!project) return;
    const point = await makeScenePoint(globe.current, p);
    await save(withHistory({ ...project, waypoints: wps, scene: { ...project.scene, [mode]: point } }, mode === "takeoff" ? "Point de décollage placé" : "Sujet placé"));
  }

  async function toTimeline() {
    if (!project || !traj) return;
    const shot = { id: crypto.randomUUID(), moveId: "custom-path", label: "Waypoints", durationS: Math.max(1, Math.min(600, Math.round(traj.estimatedDurationS))), transitionS: project.timeline.length ? 2 : 0, params: { cameraMode: "subject", pitch: -15, intensity: 0.5 } };
    await save(withHistory({ ...project, waypoints: wps, timeline: [...project.timeline, shot] }, "Trajectoire ajoutée à la timeline"));
    setMsg({ kind: "ok", text: "Plan « Waypoints » ajouté à la timeline." });
  }

  // Fly to the scene when the project changes
  const flown = useRef<string | null>(null);
  useEffect(() => {
    if (!project || !status || flown.current === project.id) return;
    flown.current = project.id;
    const v = project.scene.view;
    if (v) globe.current?.flyToView(v);
    else { const a = project.scene.subject ?? project.scene.takeoff; if (a) globe.current?.flyTo({ ...a.position, heightM: 900 }); else if (project.environment.kind === "real") globe.current?.flyTo(project.environment.center); }
  }, [project, status]);

  const sel = wps.find((w) => w.id === selected) ?? null;
  const selIndex = sel ? wps.indexOf(sel) : -1;
  const canEdit = Boolean(project?.scene.takeoff);
  const update = (id: string, patch: Partial<Waypoint>) => editWps((ws) => ws.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  const move = (i: number, d: -1 | 1) => editWps((ws) => { const a = [...ws]; const j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j]!, a[i]!]; return a; });

  return (
    <div className="relative h-[calc(100dvh-3.5rem)] w-full overflow-hidden lg:h-dvh">
      <GlobeView ref={globe} quality={getQuality().value} imagery={hasIonToken ? "satellite" : "map"} terrain showTracks showMarkers
        tracks={project?.gpxTracks ?? []} takeoff={project?.scene.takeoff?.position} subject={project?.scene.subject?.position}
        pickMode={pickMode} initialView={project?.scene.view} onPick={onPick} onStatus={setStatus} sunDate={sunDate} />
      <PickBanner pickMode={pickMode} label={`Touchez le globe pour placer ${pickMode === "takeoff" ? "le décollage" : "le sujet"}`} onCancel={() => setPickMode(null)} />
      {adding && !pickMode && <PickBanner pickMode="add" label="Touchez le globe pour ajouter un waypoint · glissez un point pour le déplacer" onCancel={() => setAdding(false)} />}
      <Toast msg={msg} onClose={() => setMsg(null)} />

      <Panel title="Flight Designer">
        <ProjectPicker active={active} projectId={projectId} onChange={(id) => { flown.current = null; setProjectId(id); }} />

        <section>
          <div className="label mb-2">Scène</div>
          <PlacementButtons project={project} pickMode={pickMode} setPickMode={(m) => { setAdding(false); setPickMode(m); }} />
          {!canEdit && <p className="mt-2 text-[11px] text-warn">Placez d'abord le point de décollage : les hauteurs des waypoints lui sont relatives (comme « H » dans DJI Fly).</p>}
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <div className="label">Waypoints · {wps.length}</div>
            <button className={`btn h-8 text-xs ${adding ? "border-cyan/70 bg-cyan/10" : ""}`} disabled={!canEdit} onClick={() => { setPickMode(null); setAdding((a) => !a); }}>
              {adding ? <><MousePointerClick size={14} />Ajout actif</> : <><Plus size={14} />Ajouter</>}
            </button>
          </div>
          {wps.length === 0 ? <p className="text-xs text-faint">Activez « Ajouter » puis touchez le globe pour poser les points de la trajectoire.</p> : (
            <ol className="space-y-1">
              {wps.map((w, i) => (
                <li key={w.id} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs ${w.id === selected ? "bg-surface-3" : "hover:bg-surface-2"}`}>
                  <button className="mono w-5 text-faint" onClick={() => setSelected(w.id)}>{i + 1}</button>
                  <button className="min-w-0 flex-1 text-left" onClick={() => setSelected(w.id)}>
                    <div className="mono truncate">{Math.round(w.altitude.valueM)} m · {w.speedMs ?? 5} m/s{w.pauseS ? ` · pause ${w.pauseS} s` : ""}</div>
                    <div className="truncate text-[10px] text-faint">{formatLatLon(w.position, 5)}</div>
                  </button>
                  <button className="text-faint hover:text-text disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Monter"><ArrowUp size={13} /></button>
                  <button className="text-faint hover:text-text disabled:opacity-30" disabled={i === wps.length - 1} onClick={() => move(i, 1)} aria-label="Descendre"><ArrowDown size={13} /></button>
                  <button className="text-faint hover:text-danger" onClick={() => editWps((ws) => ws.filter((x) => x.id !== w.id))} aria-label={`Supprimer le waypoint ${i + 1}`}><Trash2 size={13} /></button>
                </li>
              ))}
            </ol>
          )}
        </section>

        {sel && (
          <section className="space-y-3 rounded-lg border border-line bg-bg/40 p-3">
            <div className="label">Waypoint {selIndex + 1}</div>
            <NumberField label="Hauteur / décollage" unit="m" min={0} max={150} value={sel.altitude.valueM} onChange={(v) => update(sel.id, { altitude: { ...sel.altitude, valueM: v } })} />
            <NumberField label="Vitesse en sortie (simulée)" unit="m/s" min={0.5} max={20} step={0.5} value={sel.speedMs ?? 5} onChange={(v) => update(sel.id, { speedMs: v })} />
            <NumberField label="Pause" unit="s" min={0} max={60} value={sel.pauseS} onChange={(v) => update(sel.id, { pauseS: v })} />
            <NumberField label="Inclinaison nacelle" unit="°" min={-90} max={30} value={sel.gimbalPitchDeg ?? -15} onChange={(v) => update(sel.id, { gimbalPitchDeg: v })} />
            <label className="block text-[11px] text-muted">Caméra
              <select className="input mt-1 h-8 text-xs" value={sel.cameraMode} onChange={(e) => update(sel.id, { cameraMode: e.target.value as Waypoint["cameraMode"] })}>
                <option value="look-at-subject">Regarde le sujet</option><option value="free">Libre</option><option value="fixed-heading">Cap fixe</option>
              </select>
            </label>
          </section>
        )}

        <section>
          <div className="mb-2 flex items-center justify-between">
            <div className="label">Trajectoire</div>
            <select className="input h-8 w-auto text-xs" value={project?.interpolation ?? "catmull-rom"} disabled={!project}
              onChange={(e) => project && save(withHistory({ ...project, waypoints: wps, interpolation: e.target.value as Project["interpolation"] }, "Interpolation modifiée"))}>
              <option value="catmull-rom">Spline</option><option value="linear">Lignes droites</option>
            </select>
          </div>
          {traj && wps.length >= 2 ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Distance totale" value={`${traj.totalDistanceM.toFixed(0)} m`} />
                <Stat label="Durée estimée" value={`${traj.estimatedDurationS.toFixed(0)} s`} />
                <Stat label="Vitesse moyenne" value={`${traj.averageSpeedMs.toFixed(1)} m/s`} />
                <Stat label="Vitesse max simulée" value={`${traj.maxSimulatedSpeedMs.toFixed(1)} m/s`} />
                <Stat label="Hauteur min / max" value={`${traj.minAltitudeM?.toFixed(0)} / ${traj.maxAltitudeM?.toFixed(0)} m`} />
                <Stat label="Dégagement sol min" value={clearance === undefined ? "…" : clearance === null ? "n/d" : `${clearance.toFixed(0)} m`} warn={clearance !== null && clearance !== undefined && clearance < (project?.simulation.minClearanceM ?? 10)} />
              </div>
              <details className="mt-2 text-xs">
                <summary className="cursor-pointer text-muted">Longueur des segments</summary>
                <ol className="mono mt-1 space-y-0.5 text-[11px] text-faint">{traj.segments.map((s, i) => <li key={i}>{i + 1} → {i + 2} : {s.lengthM.toFixed(0)} m · {s.durationS.toFixed(1)} s</li>)}</ol>
              </details>
              <p className="mt-2 text-[10.5px] text-warn">Estimations de simulation (profil de vitesse trapézoïdal, 2 m/s²) — pas des performances réelles.</p>
              <button className="btn mt-2 h-8 w-full justify-center text-xs" onClick={toTimeline}><Clapperboard size={13} />Ajouter à la timeline</button>
            </>
          ) : <p className="text-xs text-faint">Au moins 2 waypoints pour calculer la trajectoire.</p>}
        </section>

        <section>
          <div className="label mb-2">Vérifications</div>
          <ul className="space-y-2.5">{checks.slice(0, 6).map((c) => <CheckItem key={c.id} level={c.level} title={c.title} detail={c.detail} />)}</ul>
          <Link href="/flight-safety" className="mt-2 inline-block text-[11px] text-cyan hover:underline">Toutes les vérifications</Link>
        </section>
        {frame?.warnings.map((w) => <p key={w} className="text-[11px] text-warn">{w}</p>)}
      </Panel>
    </div>
  );
}
