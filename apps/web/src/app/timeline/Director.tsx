"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown, ArrowUp, Camera, Copy, FastForward, Gauge, Pause, Play, Plus, Rewind, Square, Trash2,
} from "lucide-react";
import type { CameraSettings, LatLon, Project, Shot, SimulationSettings } from "@dfs/shared-types";
import {
  MOVES_BY_ID, defaultParams, evaluateSequence, lookAngles, planSequence, sampleSequence, sanitizeParams, type ShotContext,
} from "@dfs/cinematic-engine";
import { analyze, simulate, type SimPoint } from "@dfs/flight-simulator";
import type { Vec3 } from "@dfs/trajectory-engine";
import { GlobeView, type GlobeHandle, type GlobeStatus, type PickMode } from "@/components/globe/GlobeView";
import { NumberField, Panel, PickBanner, PlacementButtons, ProjectPicker, Stat, Toast } from "@/components/workspace/Kit";
import { buildSceneFrame, groundUnder, makeScenePoint } from "@/lib/scene";
import { withHistory } from "@/lib/projects";
import { getQuality } from "@/lib/quality";
import { useActiveProject } from "@/lib/useActiveProject";
import { useStudio } from "@/lib/store";
import { useSunTime } from "@/lib/useSunTime";
import { SunControl } from "@/components/globe/SunControl";
import { hasIonToken } from "@/lib/cesium";

export type DirectorTab = "plan" | "camera" | "simulation";
const DS = "director";
const RATES = [0.25, 0.5, 1, 2, 4];
const CAMERA_MODES: { id: CameraSettings["mode"]; label: string }[] = [
  { id: "drone", label: "Drone Camera" }, { id: "cinematic", label: "Cinematic Preview" }, { id: "first-person", label: "First Person" },
  { id: "subject", label: "Subject Camera" }, { id: "free", label: "Free Camera" },
];
const QUICK = ["orbit-partial", "reveal", "pull-out", "follow", "ascend"];
const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

export function Director({ initialTab }: { initialTab: DirectorTab }) {
  const { save } = useStudio();
  const { active, project, projectId, setProjectId } = useActiveProject();
  const globe = useRef<GlobeHandle>(null);
  const [status, setStatus] = useState<GlobeStatus | null>(null);
  const [tab, setTab] = useState<DirectorTab>(initialTab);
  const [pickMode, setPickMode] = useState<PickMode>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err" | "warn"; text: string } | null>(null);

  // ---- draft (debounced save) ----
  const [shots, setShots] = useState<Shot[]>([]);
  const [cam, setCam] = useState<CameraSettings>({ mode: "drone", fovDeg: 80, subjectHeightM: 1.7, letterbox: true });
  const [sim, setSim] = useState<SimulationSettings>({ mode: "ideal", maxSpeedMs: 8, maxAccelMs2: 3, minClearanceM: 10 });
  const dirty = useRef(false);
  const [sunDate, sunFixed, setSun] = useSunTime();
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!project || dirty.current) return;
    if (loadedFor.current === project.id + project.updatedAt) return;
    loadedFor.current = project.id + project.updatedAt;
    setShots(project.timeline); setCam(project.camera); setSim(project.simulation);
  }, [project]);
  const edit = useCallback(<T,>(set: (fn: (v: T) => T) => void) => (fn: (v: T) => T) => { dirty.current = true; set(fn); }, []);
  const editShots = edit(setShots), editCam = edit(setCam), editSim = edit(setSim);
  useEffect(() => {
    if (!dirty.current || !project) return;
    const t = setTimeout(() => {
      dirty.current = false;
      save(withHistory({ ...project, timeline: shots, camera: cam, simulation: sim }, "Plan de tournage modifié")).catch((e) => setMsg({ kind: "err", text: e.message }));
    }, 800);
    return () => clearTimeout(t);
  }, [shots, cam, sim, project, save]);

  const draft: Project | null = useMemo(() => (project ? { ...project, timeline: shots, camera: cam, simulation: sim } : null), [project, shots, cam, sim]);
  const frame = useMemo(() => (draft ? buildSceneFrame(draft) : null), [draft]);
  const ctx: ShotContext = useMemo(() => ({ subjectTrack: frame?.subjectTrack, customPath: frame?.waypointPath, subjectHeightM: cam.subjectHeightM }), [frame, cam.subjectHeightM]);
  const plan = useMemo(() => planSequence(shots), [shots]);
  const samples = useMemo(() => (frame && shots.length ? sampleSequence(plan, ctx, 10) : []), [plan, ctx, frame, shots.length]);
  const simPts: SimPoint[] = useMemo(() => simulate(samples.map((s) => ({ t: s.t, pos: s.drone })), sim), [samples, sim]);

  // ground under the simulated path (debounced, terrain only)
  const [ground, setGround] = useState<(number | null)[]>([]);
  useEffect(() => {
    setGround([]);
    if (!frame || !simPts.length || !status) return;
    let cancel = false;
    const t = setTimeout(() => { groundUnder(globe.current, frame, simPts.map((p) => p.pos)).then((g) => !cancel && setGround(g)).catch(() => {}); }, 900);
    return () => { cancel = true; clearTimeout(t); };
  }, [frame, simPts, status]);

  const analysis = useMemo(() => {
    if (!frame || !simPts.length) return null;
    const a = analyze({
      sim: simPts, groundZ: ground, takeoffZ: frame.takeoff.z, takeoff: frame.takeoff,
      subjectAt: (t) => samples[Math.min(samples.length - 1, Math.round(t * 10))]?.subject ?? { x: 0, y: 0, z: 0 },
      maxSpeedMs: sim.maxSpeedMs, maxAccelMs2: sim.maxAccelMs2, minClearanceM: sim.minClearanceM,
    });
    if (a.maxHeightTakeoffM > 120) a.issues.push({ level: "warning", code: "h120", atS: 0, message: `Hauteur max ${a.maxHeightTakeoffM.toFixed(0)} m / décollage : au-delà de 120 m (référence catégorie ouverte UE). Vérifiez la réglementation.` });
    if (draft?.droneProfileId === "dji-neo-2" && a.maxHeightTakeoffM > 60) a.issues.push({ level: "warning", code: "neo60", atS: 0, message: "DJI Neo 2 : 60 m max en contrôle par smartphone (sans radiocommande) — FAQ officielle DJI." });
    return a;
  }, [frame, simPts, ground, samples, sim, draft?.droneProfileId]);

  // ---- playback ----
  const [t, setT] = useState(0);
  const tRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const pose = useRef<{ drone: Vec3; subject: Vec3; heading: number; pitch: number; shot: number } | null>(null);

  const poseAt = useCallback((time: number) => {
    if (!frame || !shots.length) return null;
    const s = evaluateSequence(plan, time, ctx);
    if (!s) return null;
    let drone = s.drone;
    if (sim.mode === "inertia" && simPts.length) {
      const i = Math.min(simPts.length - 1, Math.max(0, time * 10));
      const a = simPts[Math.floor(i)]!, b = simPts[Math.ceil(i)]!, f = i - Math.floor(i);
      drone = { x: a.pos.x + (b.pos.x - a.pos.x) * f, y: a.pos.y + (b.pos.y - a.pos.y) * f, z: a.pos.z + (b.pos.z - a.pos.z) * f };
    }
    return { drone, subject: s.subject, heading: s.camera.headingDeg, pitch: s.camera.pitchDeg, shot: s.shotIndex };
  }, [frame, shots.length, plan, ctx, sim.mode, simPts]);

  const applyCamera = useCallback(() => {
    const raw = globe.current?.raw();
    const p = pose.current;
    if (!raw || !frame) return;
    const { viewer, Cs } = raw;
    const free = cam.mode === "free" || !p;
    viewer.scene.screenSpaceCameraController.enableInputs = free;
    const fr = viewer.camera.frustum as import("cesium").PerspectiveFrustum;
    fr.fov = Cs.Math.toRadians(free ? 60 : cam.fovDeg);
    if (!free && p) {
      const look = (from: Vec3, heading: number, pitch: number) => {
        const g = frame.toGeo(from);
        viewer.camera.setView({ destination: Cs.Cartesian3.fromDegrees(g.lon, g.lat, g.h), orientation: { heading: Cs.Math.toRadians(heading), pitch: Cs.Math.toRadians(pitch), roll: 0 } });
      };
      if (cam.mode === "drone" || cam.mode === "cinematic") look(p.drone, p.heading, p.pitch);
      else if (cam.mode === "first-person") {
        const ahead = poseAt(tRef.current + 0.3)?.drone ?? p.drone;
        const a = lookAngles(p.drone, ahead);
        look(p.drone, a.headingDeg, Math.max(-60, Math.min(20, a.pitchDeg)));
      } else if (cam.mode === "subject") {
        const eye = { ...p.subject, z: p.subject.z + cam.subjectHeightM };
        const a = lookAngles(eye, p.drone);
        look(eye, a.headingDeg, a.pitchDeg);
      }
    }
    viewer.scene.requestRender();
  }, [cam, frame, poseAt]);

  const seek = useCallback((time: number) => {
    const v = Math.max(0, Math.min(plan.durationS, time));
    tRef.current = v; setT(v);
    pose.current = poseAt(v);
    applyCamera();
  }, [plan.durationS, poseAt, applyCamera]);

  useEffect(() => { seek(Math.min(tRef.current, plan.durationS)); }, [plan, poseAt]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { applyCamera(); }, [cam, applyCamera]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now(), lastUi = 0;
    const loop = (now: number) => {
      const dt = (now - last) / 1000; last = now;
      let nt = tRef.current + dt * rate;
      if (nt >= plan.durationS) { nt = plan.durationS; setPlaying(false); }
      tRef.current = nt;
      pose.current = poseAt(nt);
      applyCamera();
      if (now - lastUi > 66) { setT(nt); lastUi = now; }
      if (nt < plan.durationS) raf = requestAnimationFrame(loop);
      else setT(nt);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, rate, plan.durationS, poseAt, applyCamera]);

  // ---- drawing (paths + live drone/subject) ----
  useEffect(() => {
    const raw = globe.current?.raw();
    if (!raw || !frame) return;
    const { viewer, Cs } = raw;
    let ds = viewer.dataSources.getByName(DS)[0];
    if (!ds) { ds = new Cs.CustomDataSource(DS); void viewer.dataSources.add(ds); }
    ds.entities.removeAll();
    const toC = (p: Vec3) => { const g = frame.toGeo(p); return Cs.Cartesian3.fromDegrees(g.lon, g.lat, g.h); };
    if (samples.length > 1) {
      ds.entities.add({ polyline: { positions: samples.map((s) => toC(s.drone)), width: 3, material: new Cs.PolylineGlowMaterialProperty({ glowPower: 0.2, color: Cs.Color.fromCssColorString("#2ad4ee") }) } });
      if (sim.mode === "inertia") ds.entities.add({ polyline: { positions: simPts.map((p) => toC(p.pos)), width: 2, material: new Cs.PolylineDashMaterialProperty({ color: Cs.Color.fromCssColorString("#f5b84a") }) } });
      const subj = samples.map((s) => s.subject);
      if (subj.some((p) => Math.hypot(p.x, p.y) > 1)) ds.entities.add({ polyline: { positions: subj.map((p) => toC({ ...p, z: p.z + 0.5 })), width: 2, material: Cs.Color.WHITE.withAlpha(0.5) } });
      // shot boundaries
      plan.shotStarts.forEach((st, i) => {
        const s = samples[Math.min(samples.length - 1, Math.round(st * 10))];
        if (s) ds!.entities.add({ position: toC(s.drone), label: { text: `${i + 1}`, font: "700 11px system-ui", fillColor: Cs.Color.fromCssColorString("#06090f"), showBackground: true, backgroundColor: Cs.Color.fromCssColorString("#2ad4ee"), disableDepthTestDistance: Number.POSITIVE_INFINITY, pixelOffset: new Cs.Cartesian2(0, -14) } });
      });
    }
    const dronePos = new Cs.CallbackPositionProperty(() => (pose.current ? toC(pose.current.drone) : undefined), false);
    const subjPos = new Cs.CallbackPositionProperty(() => (pose.current ? toC({ ...pose.current.subject, z: pose.current.subject.z + 0.5 }) : undefined), false);
    ds.entities.add({ position: dronePos, point: { pixelSize: 13, color: Cs.Color.fromCssColorString("#2ad4ee"), outlineColor: Cs.Color.WHITE, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY }, label: { text: "Drone", font: "600 11px system-ui", pixelOffset: new Cs.Cartesian2(0, -20), showBackground: true, backgroundColor: Cs.Color.fromCssColorString("#06090fcc"), disableDepthTestDistance: Number.POSITIVE_INFINITY } });
    ds.entities.add({ position: subjPos, point: { pixelSize: 10, color: Cs.Color.fromCssColorString("#f5b84a"), outlineColor: Cs.Color.fromCssColorString("#06090f"), outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY } });
    ds.entities.add({ polyline: { positions: new Cs.CallbackProperty(() => {
      const p = pose.current; if (!p) return [];
      const h = (p.heading * Math.PI) / 180, pi = (p.pitch * Math.PI) / 180, L = 25;
      return [toC(p.drone), toC({ x: p.drone.x + L * Math.sin(h) * Math.cos(pi), y: p.drone.y + L * Math.cos(h) * Math.cos(pi), z: p.drone.z + L * Math.sin(pi) })];
    }, false), width: 2, material: Cs.Color.WHITE.withAlpha(0.7) } });
    viewer.scene.requestRender();
  }, [frame, samples, simPts, sim.mode, plan, status]);

  // fly to scene on project change
  const flown = useRef<string | null>(null);
  useEffect(() => {
    if (!project || !status || flown.current === project.id) return;
    flown.current = project.id;
    const a = project.scene.subject ?? project.scene.takeoff;
    if (project.scene.view) globe.current?.flyToView(project.scene.view);
    else if (a) globe.current?.flyTo({ ...a.position, heightM: 700 });
  }, [project, status]);

  async function onPick(mode: "takeoff" | "subject", p: LatLon) {
    setPickMode(null);
    if (!project) return;
    const pt = await makeScenePoint(globe.current, p);
    await save(withHistory({ ...project, timeline: shots, camera: cam, simulation: sim, scene: { ...project.scene, [mode]: pt } }, mode === "takeoff" ? "Point de décollage placé" : "Sujet placé"));
  }

  // ---- shots editing ----
  const [selected, setSelected] = useState<string | null>(null);
  const sel = shots.find((s) => s.id === selected) ?? null;
  const addShot = (moveId: string) => {
    const m = MOVES_BY_ID[moveId]!;
    const s: Shot = { id: crypto.randomUUID(), moveId, durationS: m.defaultDurationS, transitionS: shots.length ? 2 : 0, params: defaultParams(moveId) };
    editShots((xs) => [...xs, s]); setSelected(s.id);
  };
  const patchShot = (id: string, p: Partial<Shot>) => editShots((xs) => xs.map((s) => (s.id === id ? { ...s, ...p } : s)));
  const moveShot = (i: number, d: -1 | 1) => editShots((xs) => { const a = [...xs]; const j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j]!, a[i]!]; return a; });

  const curShot = pose.current?.shot ?? -1;
  const hasScene = Boolean(frame);
  const letterbox = cam.mode === "cinematic" && cam.letterbox;

  return (
    <div className="relative h-[calc(100dvh-3.5rem)] w-full overflow-hidden lg:h-dvh">
      <GlobeView ref={globe} quality={getQuality().value} imagery={hasIonToken ? "satellite" : "map"} terrain showTracks showMarkers
        tracks={project?.gpxTracks ?? []} takeoff={project?.scene.takeoff?.position} subject={cam.mode === "free" ? project?.scene.subject?.position : undefined}
        pickMode={pickMode} initialView={project?.scene.view} onPick={onPick} onStatus={setStatus} sunDate={sunDate} />

      {letterbox && (
        <div className="pointer-events-none absolute inset-0 z-[5] flex flex-col">
          <div className="flex-1 bg-black" />
          <div className="relative w-full" style={{ aspectRatio: "2.39 / 1", maxHeight: "100%" }}>
            <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">{Array.from({ length: 9 }).map((_, i) => <div key={i} className="border border-white/10" />)}</div>
          </div>
          <div className="flex-1 bg-black" />
        </div>
      )}
      <PickBanner pickMode={pickMode} label={`Touchez le globe pour placer ${pickMode === "takeoff" ? "le décollage" : "le sujet"}`} onCancel={() => setPickMode(null)} />
      <Toast msg={msg} onClose={() => setMsg(null)} />

      {/* HUD */}
      {pose.current && analysis && (
        <div className="pointer-events-none absolute left-3 top-3 z-10 hidden rounded-lg border border-line bg-bg/75 px-3 py-2 text-[11px] backdrop-blur sm:block">
          <div className="mono space-y-0.5">
            <div className="text-cyan">{curShot >= 0 ? `${curShot + 1}. ${MOVES_BY_ID[shots[curShot]!.moveId]?.name}` : "Transition"}</div>
            <div>H {(pose.current.drone.z - frame!.takeoff.z).toFixed(0)} m / décollage</div>
            <div>Sujet {Math.hypot(pose.current.drone.x - pose.current.subject.x, pose.current.drone.y - pose.current.subject.y, pose.current.drone.z - pose.current.subject.z).toFixed(0)} m</div>
            <div>Vitesse {(simPts[Math.min(simPts.length - 1, Math.round(t * 10))]?.speedMs ?? 0).toFixed(1)} m/s</div>
            <div className="text-faint">{CAMERA_MODES.find((c) => c.id === cam.mode)?.label} · simulation</div>
          </div>
        </div>
      )}

      {/* Transport + timeline */}
      <div className="absolute left-3 right-3 top-3 z-10 rounded-xl border border-line bg-surface/92 p-2.5 backdrop-blur-md lg:bottom-3 lg:left-3 lg:right-[372px] lg:top-auto">
        <div className="flex items-center gap-1.5">
          <button className="btn h-8 w-8 justify-center p-0" onClick={() => seek(0)} aria-label="Retour au début"><Square size={13} /></button>
          <button className="btn h-8 w-8 justify-center p-0" onClick={() => seek(tRef.current - 5)} aria-label="Reculer de 5 s"><Rewind size={14} /></button>
          <button className="btn btn-primary h-8 w-10 justify-center p-0" disabled={!plan.durationS || !hasScene} onClick={() => { if (tRef.current >= plan.durationS) seek(0); setPlaying((p) => !p); }} aria-label={playing ? "Pause" : "Lecture"}>{playing ? <Pause size={15} /> : <Play size={15} />}</button>
          <button className="btn h-8 w-8 justify-center p-0" onClick={() => seek(tRef.current + 5)} aria-label="Avancer de 5 s"><FastForward size={14} /></button>
          <span className="mono ml-1 text-xs">{fmt(t)} <span className="text-faint">/ {fmt(plan.durationS)}</span></span>
          <div className="ml-auto flex items-center gap-1">
            <Gauge size={13} className="text-faint" />
            {RATES.map((r) => <button key={r} className={`mono rounded px-1.5 py-0.5 text-[11px] ${rate === r ? "bg-cyan/15 text-cyan" : "text-faint hover:text-text"}`} onClick={() => setRate(r)}>{r}×</button>)}
          </div>
        </div>
        {/* track */}
        <div className="relative mt-2 h-9 cursor-pointer select-none overflow-hidden rounded-md bg-bg"
          onPointerDown={(e) => { const r = e.currentTarget.getBoundingClientRect(); seek(((e.clientX - r.left) / r.width) * plan.durationS); }}>
          {plan.durationS > 0 && plan.segments.map((sg, i) => {
            const left = (sg.start / plan.durationS) * 100, width = (sg.duration / plan.durationS) * 100;
            const shot = shots[sg.shotIndex]!;
            return sg.kind === "transition"
              ? <div key={i} className="absolute top-1 bottom-1 bg-gradient-to-r from-cyan/10 via-cyan/25 to-cyan/10" style={{ left: `${left}%`, width: `${width}%` }} />
              : <button key={i} onPointerDown={(e) => e.stopPropagation()} onClick={() => { setSelected(shot.id); setTab("plan"); seek(sg.start); }}
                  className={`absolute top-1 bottom-1 truncate rounded px-1.5 text-left text-[10.5px] ${shot.id === selected ? "bg-accent/40 text-white ring-1 ring-cyan" : "bg-surface-3 text-muted hover:bg-accent/25"}`} style={{ left: `${left}%`, width: `${width}%` }}>
                  {sg.shotIndex + 1}. {shot.label ?? MOVES_BY_ID[shot.moveId]?.name}
                </button>;
          })}
          {!shots.length && <div className="grid h-full place-items-center text-[11px] text-faint">Timeline vide</div>}
          {plan.durationS > 0 && <div className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_6px_white]" style={{ left: `${(t / plan.durationS) * 100}%` }} />}
        </div>
        <input type="range" className="mt-1.5 w-full accent-[var(--color-cyan)]" min={0} max={plan.durationS || 1} step={0.05} value={t} onChange={(e) => seek(Number(e.target.value))} aria-label="Position dans la séquence" />
      </div>

      <Panel title="Studio de réalisation" side="right" width={356}>
        <ProjectPicker active={active} projectId={projectId} onChange={(id) => { flown.current = null; loadedFor.current = null; dirty.current = false; setProjectId(id); setPlaying(false); }} />
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-bg p-1">
          {(["plan", "camera", "simulation"] as const).map((k) => (
            <button key={k} onClick={() => setTab(k)} className={`rounded-md py-1.5 text-xs ${tab === k ? "bg-surface-3 text-text" : "text-muted"}`}>{k === "plan" ? "Plans" : k === "camera" ? "Caméra" : "Simulation"}</button>
          ))}
        </div>

        {!project?.scene.subject || !project.scene.takeoff ? (
          <section>
            <div className="label mb-2">Scène</div>
            <PlacementButtons project={project} pickMode={pickMode} setPickMode={setPickMode} />
            <p className="mt-2 text-[11px] text-warn">Placez le sujet et le décollage : les mouvements sont calculés autour du sujet, les hauteurs relatives au décollage.</p>
          </section>
        ) : null}

        {tab === "plan" && (
          <>
            <section>
              <div className="mb-2 flex items-center justify-between">
                <div className="label">Séquence · {shots.length} plan(s)</div>
                <span className="flex gap-3"><Link href="/cinematic-library" className="text-[11px] text-cyan hover:underline">Bibliothèque</Link><Link href="/companion" className="text-[11px] text-cyan hover:underline">Companion</Link></span>
              </div>
              <div className="mb-2 flex flex-wrap gap-1">{QUICK.map((id) => <button key={id} className="btn h-7 px-2 text-[11px]" onClick={() => addShot(id)} disabled={!project}><Plus size={11} />{MOVES_BY_ID[id]!.name}</button>)}</div>
              <ol className="space-y-1">
                {shots.map((s, i) => (
                  <li key={s.id} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs ${s.id === selected ? "bg-surface-3" : "hover:bg-surface-2"}`}>
                    <button className="min-w-0 flex-1 text-left" onClick={() => { setSelected(s.id); seek(plan.shotStarts[i]!); }}>
                      <div className="truncate">{i + 1}. {s.label ?? MOVES_BY_ID[s.moveId]?.name ?? s.moveId}</div>
                      <div className="mono text-[10px] text-faint">{fmt(plan.shotStarts[i]!)} · {s.durationS} s{i > 0 && s.transitionS ? ` · fondu ${s.transitionS} s` : ""}</div>
                    </button>
                    <button className="text-faint hover:text-text disabled:opacity-30" disabled={i === 0} onClick={() => moveShot(i, -1)} aria-label="Monter"><ArrowUp size={13} /></button>
                    <button className="text-faint hover:text-text disabled:opacity-30" disabled={i === shots.length - 1} onClick={() => moveShot(i, 1)} aria-label="Descendre"><ArrowDown size={13} /></button>
                    <button className="text-faint hover:text-text" onClick={() => editShots((xs) => { const c = { ...s, id: crypto.randomUUID() }; const a = [...xs]; a.splice(i + 1, 0, c); return a; })} aria-label="Dupliquer"><Copy size={13} /></button>
                    <button className="text-faint hover:text-danger" onClick={() => editShots((xs) => xs.filter((x) => x.id !== s.id))} aria-label="Supprimer"><Trash2 size={13} /></button>
                  </li>
                ))}
              </ol>
            </section>
            {sel && (
              <section className="space-y-3 rounded-lg border border-line bg-bg/40 p-3">
                <div className="label">{MOVES_BY_ID[sel.moveId]?.name}</div>
                <NumberField label="Durée" unit="s" min={2} max={120} value={sel.durationS} onChange={(v) => patchShot(sel.id, { durationS: v })} />
                {shots.indexOf(sel) > 0 && <NumberField label="Transition depuis le plan précédent" unit="s" min={0} max={10} step={0.5} value={sel.transitionS} onChange={(v) => patchShot(sel.id, { transitionS: v })} />}
                {MOVES_BY_ID[sel.moveId]?.params.map((p) => p.kind === "number" ? (
                  <NumberField key={p.key} label={p.label} unit={p.unit} min={p.min} max={p.max} step={p.step} value={(sel.params[p.key] as number) ?? (p.default as number)} onChange={(v) => patchShot(sel.id, { params: sanitizeParams(sel.moveId, { ...sel.params, [p.key]: v }) })} />
                ) : p.kind === "select" ? (
                  <label key={p.key} className="block text-[11px] text-muted">{p.label}
                    <select className="input mt-1 h-8 text-xs" value={String(sel.params[p.key] ?? p.default)} onChange={(e) => patchShot(sel.id, { params: sanitizeParams(sel.moveId, { ...sel.params, [p.key]: e.target.value }) })}>
                      {p.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </label>
                ) : (
                  <label key={p.key} className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" className="accent-[var(--color-cyan)]" checked={Boolean(sel.params[p.key] ?? p.default)} onChange={(e) => patchShot(sel.id, { params: sanitizeParams(sel.moveId, { ...sel.params, [p.key]: e.target.checked }) })} />{p.label}</label>
                ))}
                {sel.moveId === "custom-path" && (frame?.waypointPath.length ?? 0) < 2 && <p className="text-[11px] text-warn">Ce plan suit les waypoints : ajoutez-en au moins 2 dans le <Link href="/flight-designer" className="underline">Flight Designer</Link>.</p>}
              </section>
            )}
          </>
        )}

        {tab === "camera" && (
          <section className="space-y-3">
            <div className="label">Mode caméra</div>
            <div className="grid grid-cols-2 gap-1.5">
              {CAMERA_MODES.map((m) => <button key={m.id} className={`btn h-8 justify-center text-xs ${cam.mode === m.id ? "border-cyan/60 bg-cyan/10" : "text-muted"}`} onClick={() => editCam((c) => ({ ...c, mode: m.id }))}>{m.id === "drone" && <Camera size={12} />}{m.label}</button>)}
            </div>
            <NumberField label="Champ de vision horizontal" unit="°" min={20} max={140} value={cam.fovDeg} onChange={(v) => editCam((c) => ({ ...c, fovDeg: v }))} />
            <p className="-mt-1 text-[10.5px] text-faint">Réglez-le sur la valeur de votre caméra (fiche technique) : l'aperçu n'est fidèle qu'à cette condition.</p>
            <NumberField label="Point visé au-dessus du sujet" unit="m" min={0} max={10} step={0.1} value={cam.subjectHeightM} onChange={(v) => editCam((c) => ({ ...c, subjectHeightM: v }))} />
            <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" className="accent-[var(--color-cyan)]" checked={cam.letterbox} onChange={(e) => editCam((c) => ({ ...c, letterbox: e.target.checked }))} />Bandes 2.39:1 et grille des tiers (Cinematic Preview)</label>
            <div className="label pt-2">Lumière réelle (soleil)</div>
            {project?.scene.subject && <SunControl date={sunDate} fixed={sunFixed} onChange={setSun} lat={project.scene.subject.position.lat} lon={project.scene.subject.position.lon} />}
            <p className="text-[10.5px] text-faint">La caméra virtuelle est indépendante de la trajectoire : chaque mouvement définit où elle regarde (sujet, horizon, sol), les transitions la font pivoter en douceur.</p>
          </section>
        )}

        {tab === "simulation" && (
          <section className="space-y-3">
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-bg p-1">
              {(["ideal", "inertia"] as const).map((m) => <button key={m} className={`rounded-md py-1.5 text-xs ${sim.mode === m ? "bg-surface-3 text-text" : "text-muted"}`} onClick={() => editSim((s) => ({ ...s, mode: m }))}>{m === "ideal" ? "Trajectoire idéale" : "Avec inertie"}</button>)}
            </div>
            <NumberField label="Vitesse max (simulation)" unit="m/s" min={1} max={20} step={0.5} value={sim.maxSpeedMs} onChange={(v) => editSim((s) => ({ ...s, maxSpeedMs: v }))} />
            <NumberField label="Accélération max (simulation)" unit="m/s²" min={0.5} max={10} step={0.5} value={sim.maxAccelMs2} onChange={(v) => editSim((s) => ({ ...s, maxAccelMs2: v }))} />
            <NumberField label="Dégagement minimal au relief" unit="m" min={0} max={50} value={sim.minClearanceM} onChange={(v) => editSim((s) => ({ ...s, minClearanceM: v }))} />
            {analysis && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Stat label="Durée" value={fmt(analysis.durationS)} />
                  <Stat label="Distance" value={`${analysis.distanceM.toFixed(0)} m`} />
                  <Stat label="Vitesse max" value={`${analysis.maxSpeedMs.toFixed(1)} m/s`} warn={analysis.maxSpeedMs > sim.maxSpeedMs + 0.05} />
                  <Stat label="Vitesse moyenne" value={`${analysis.avgSpeedMs.toFixed(1)} m/s`} />
                  <Stat label="Hauteur min / max" value={`${analysis.minHeightTakeoffM.toFixed(0)} / ${analysis.maxHeightTakeoffM.toFixed(0)} m`} />
                  <Stat label="Dégagement relief" value={analysis.minClearanceM === null ? (status?.terrain === "world-terrain" ? "…" : "n/d") : `${analysis.minClearanceM.toFixed(0)} m`} warn={analysis.minClearanceM !== null && analysis.minClearanceM < sim.minClearanceM} />
                  <Stat label="Éloignement max" value={`${analysis.maxDistanceFromTakeoffM.toFixed(0)} m`} warn={analysis.maxDistanceFromTakeoffM > 500} />
                  <Stat label="Distance min sujet" value={`${analysis.minDistanceToSubjectM.toFixed(1)} m`} warn={analysis.minDistanceToSubjectM < 3} />
                </div>
                {analysis.issues.length ? (
                  <ul className="space-y-1.5">{analysis.issues.map((i) => (
                    <li key={i.code} className={`rounded-md border px-2.5 py-1.5 text-[11px] ${i.level === "technical-block" ? "border-danger/40 text-danger" : "border-warn/30 text-warn"}`}>
                      {i.atS > 0 ? <button className="mono mr-1 underline" onClick={() => seek(i.atS)}>{fmt(i.atS)}</button> : null}{i.message}
                    </li>
                  ))}</ul>
                ) : <p className="text-xs text-ok">Aucune alerte de simulation.</p>}
              </>
            )}
            <p className="text-[10.5px] leading-relaxed text-faint">Simulation : modèle de point avec vitesse et accélération bornées, réglables. Elle ne reproduit pas le comportement réel du Neo 2 (caractéristiques dynamiques non publiées) et ne garantit aucune sécurité : arbres, câbles et bâtiments ne sont pas modélisés.</p>
          </section>
        )}
        {frame?.warnings.map((w) => <p key={w} className="text-[11px] text-warn">{w}</p>)}
      </Panel>
    </div>
  );
}
