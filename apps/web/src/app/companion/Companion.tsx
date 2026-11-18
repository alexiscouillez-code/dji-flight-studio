"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, Check, Download, ExternalLink, LocateFixed, Pause, Play, Printer, RotateCcw, ShieldCheck, Sparkles, TriangleAlert, WifiOff,
} from "lucide-react";
import { migrateProject, type Project } from "@dfs/shared-types";
import { buildCompanionGuide, guideToMarkdown, NATIVE_MODES_SOURCE, planSequence, sampleSequence, compassLabel, type CompanionStep } from "@dfs/cinematic-engine";
import { evaluateMission, LEVEL_ORDER } from "@dfs/flight-safety";
import { formatLatLon, haversineDistanceM, initialBearingDeg } from "@dfs/geographic-engine";
import { CheckItem } from "@/components/CheckItem";
import { ProjectPicker } from "@/components/workspace/Kit";
import { buildSceneFrame } from "@/lib/scene";
import { downloadText, slugify, withHistory } from "@/lib/projects";
import { useActiveProject } from "@/lib/useActiveProject";
import { useStudio } from "@/lib/store";

const CACHE = "dfs.companion.cache";
const CHECKLIST = [
  "Zone de vol vérifiée sur la carte officielle (en France : Géoportail — restrictions UAS) et dans DJI Fly",
  "Météo et vent compatibles avec le Neo 2",
  "Batteries chargées : drone, radiocommande RC-N2, iPhone",
  "Hélices et protections en bon état",
  "Point de retour (Home Point) enregistré dans DJI Fly, hauteur RTH adaptée au relief",
  "Zone dégagée, personnes informées, sujet briefé sur le plan",
  "Plan relu : hauteurs H, distances, sens des orbites",
  "Je garde le drone en vue directe et le contrôle permanent",
];

export function Companion() {
  const { save, error: storeError, loading } = useStudio();
  const { active, project: live, projectId, setProjectId } = useActiveProject();

  // Offline: keep the last opened project so the guide stays available without network.
  const [cached, setCached] = useState<Project | null>(null);
  useEffect(() => {
    if (live) { try { localStorage.setItem(CACHE, JSON.stringify(live)); } catch { /* quota */ } return; }
    try { const raw = localStorage.getItem(CACHE); if (raw) setCached(migrateProject(JSON.parse(raw))); } catch { /* ignore */ }
  }, [live]);
  const project = live ?? (!loading ? cached : null);
  const offline = !live && Boolean(cached) && Boolean(storeError);

  const frame = useMemo(() => (project ? buildSceneFrame(project) : null), [project]);
  const guide = useMemo(() => {
    if (!project || !frame || !project.timeline.length) return null;
    const ctx = { subjectTrack: frame.subjectTrack, customPath: frame.waypointPath, subjectHeightM: project.camera.subjectHeightM };
    const plan = planSequence(project.timeline);
    return buildCompanionGuide(plan, sampleSequence(plan, ctx, 10), { takeoff: frame.takeoff, takeoffZ: frame.takeoff.z });
  }, [project, frame]);
  const checks = useMemo(() => (project ? evaluateMission(project).sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]) : []), [project]);

  // -1 = checklist, 0 = setup, 1..n = shots, n+1 = landing
  const [step, setStep] = useState(-1);
  const [ticks, setTicks] = useState<boolean[]>(() => CHECKLIST.map(() => false));
  useEffect(() => { setStep(-1); setTicks(CHECKLIST.map(() => false)); }, [project?.id]);
  const nSteps = guide?.steps.length ?? 0;

  // keep the screen awake during the session (iOS 16.4+, best effort)
  useEffect(() => {
    if (step < 0 || !("wakeLock" in navigator)) return;
    let lock: { release(): Promise<void> } | null = null;
    (navigator as Navigator & { wakeLock: { request(t: "screen"): Promise<{ release(): Promise<void> }> } }).wakeLock.request("screen").then((l) => { lock = l; }).catch(() => {});
    return () => { void lock?.release(); };
  }, [step]);

  function exportGuide() {
    if (!project || !guide) return;
    const md = guideToMarkdown(project.name, guide, {
      takeoff: project.scene.takeoff ? formatLatLon(project.scene.takeoff.position, 5) : undefined,
      subject: project.scene.subject ? formatLatLon(project.scene.subject.position, 5) : undefined,
    });
    downloadText(`${slugify(project.name)}-guide-vol.md`, md, "text/markdown");
  }

  async function finish() {
    if (project && live) await save(withHistory(live, `Session Companion terminée (${nSteps} plan(s))`)).catch(() => {});
    setStep(-1); setTicks(CHECKLIST.map(() => false));
  }

  return (
    <div className="mx-auto max-w-xl print:max-w-none">
      <div className="mb-4 flex items-center justify-between gap-2 print:hidden">
        <div>
          <div className="label">Neo 2 Companion</div>
          <h1 className="text-xl font-semibold tracking-tight">Guide de vol manuel</h1>
        </div>
        <div className="flex gap-1.5">
          <button className="btn h-9 px-2.5" onClick={exportGuide} disabled={!guide} aria-label="Exporter le guide" title="Exporter le guide (.md)"><Download size={15} /></button>
          <button className="btn h-9 px-2.5" onClick={() => window.print()} disabled={!guide} aria-label="Imprimer" title="Imprimer"><Printer size={15} /></button>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-warn/30 bg-warn/5 px-3 py-2.5 text-xs leading-relaxed text-warn">
        Repères de préparation, <b>pas des commandes de vol</b>. Vous pilotez dans DJI Fly et gardez le contrôle permanent. DJI FLIGHT STUDIO ne communique pas avec le Neo 2 ni avec la radiocommande.
      </div>
      {offline && <div className="mb-4 flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs text-muted"><WifiOff size={14} />Hors ligne : dernier projet ouvert affiché.</div>}

      <div className="mb-4 print:hidden"><ProjectPicker active={active} projectId={projectId} onChange={setProjectId} /></div>

      {!project ? <Empty text={loading ? "Chargement…" : "Aucun projet."} /> :
        !project.scene.takeoff || !project.scene.subject ? <Empty text="Placez le décollage et le sujet dans Virtual World." href="/virtual-world" cta="Virtual World" /> :
        !guide || !nSteps ? <Empty text="La timeline est vide : composez le plan dans la Timeline." href="/timeline" cta="Timeline" /> : (
        <>
          <Progress step={step} total={nSteps} onJump={(s) => step >= 0 && setStep(s)} />

          {step === -1 && (
            <section className="panel p-4">
              <h2 className="mb-3 flex items-center gap-2 text-base font-semibold"><ShieldCheck size={18} className="text-cyan" />Check-list avant le vol</h2>
              <ul className="space-y-2.5">{checks.map((c) => <CheckItem key={c.id} level={c.level} title={c.title} detail={c.detail} />)}</ul>
              {guide.warnings.map((w) => <p key={w} className="mt-2 flex gap-2 text-xs text-warn"><TriangleAlert size={14} className="mt-0.5 shrink-0" />{w}</p>)}
              <div className="mt-4 space-y-1 border-t border-line pt-3">
                {CHECKLIST.map((c, i) => (
                  <label key={c} className="flex cursor-pointer items-start gap-3 rounded-lg px-1 py-2 text-sm hover:bg-surface-2">
                    <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-cyan)]" checked={ticks[i]} onChange={(e) => setTicks((t) => t.map((v, k) => (k === i ? e.target.checked : v)))} />
                    <span>{c}</span>
                  </label>
                ))}
              </div>
              <button className="btn btn-primary mt-4 h-12 w-full justify-center text-base" disabled={!ticks.every(Boolean)} onClick={() => setStep(0)}>
                Commencer <ArrowRight size={18} />
              </button>
              {!ticks.every(Boolean) && <p className="mt-2 text-center text-[11px] text-faint">Validez chaque point pour continuer — validation humaine obligatoire.</p>}
            </section>
          )}

          {step === 0 && <SetupCard project={project} guide={guide} />}
          {step >= 1 && step <= nSteps && <StepCard key={guide.steps[step - 1]!.shotId} s={guide.steps[step - 1]!} total={nSteps} />}
          {step === nSteps + 1 && (
            <section className="panel space-y-3 p-4">
              <h2 className="text-base font-semibold">Retour et atterrissage</h2>
              <p className="text-sm text-muted">Ramenez le Neo 2 au point de décollage ou utilisez le retour au point de départ de DJI Fly. Vérifiez la zone d'atterrissage avant de descendre.</p>
              <button className="btn btn-primary h-12 w-full justify-center text-base" onClick={finish}><Check size={18} />Terminer la session</button>
            </section>
          )}

          {step >= 0 && (
            <div className="sticky bottom-3 mt-4 grid grid-cols-[auto_1fr] gap-2 print:hidden">
              <button className="btn h-14 w-14 justify-center p-0" onClick={() => setStep((s) => Math.max(-1, s - 1))} aria-label="Étape précédente"><ArrowLeft size={20} /></button>
              {step <= nSteps && <button className="btn btn-primary h-14 justify-center text-base" onClick={() => setStep((s) => s + 1)}>{step === 0 ? "Premier plan" : step === nSteps ? "Retour et atterrissage" : "Plan suivant"}<ArrowRight size={18} /></button>}
            </div>
          )}

          {/* print-only full guide */}
          <div className="hidden print:block">{guide.steps.map((s) => <StepCard key={s.shotId} s={s} total={nSteps} printMode />)}</div>
        </>
      )}
      <p className="mt-6 text-[11px] leading-relaxed text-faint print:hidden">
        Sticks décrits en Mode 2 (réglage par défaut DJI : gauche = hauteur et rotation, droit = avant/arrière et latéral). Modes intelligents cités d'après la{" "}
        <a className="text-cyan hover:underline" href={NATIVE_MODES_SOURCE.url} target="_blank" rel="noreferrer">FAQ officielle DJI Neo 2</a> ; leur disponibilité dépend de la radiocommande et de la version de DJI Fly. Valeurs issues de la simulation : adaptez-les sur place.
      </p>
    </div>
  );
}

function Empty({ text, href, cta }: { text: string; href?: string; cta?: string }) {
  return (
    <div className="panel flex flex-col items-center gap-3 p-8 text-center text-sm text-muted">
      {text}
      {href && <Link href={href} className="btn btn-primary">{cta}<ArrowRight size={15} /></Link>}
    </div>
  );
}

function Progress({ step, total, onJump }: { step: number; total: number; onJump(s: number): void }) {
  const items = [{ k: -1, l: "Check-list" }, { k: 0, l: "Mise en place" }, ...Array.from({ length: total }, (_, i) => ({ k: i + 1, l: `Plan ${i + 1}` })), { k: total + 1, l: "Atterrissage" }];
  return (
    <div className="mb-4 flex gap-1 print:hidden" role="list" aria-label="Étapes">
      {items.map((it) => (
        <button key={it.k} role="listitem" title={it.l} aria-label={it.l} aria-current={it.k === step ? "step" : undefined} onClick={() => onJump(it.k)}
          className={`h-1.5 flex-1 rounded-full transition-colors ${it.k < step ? "bg-cyan/60" : it.k === step ? "bg-cyan" : "bg-surface-3"}`} />
      ))}
    </div>
  );
}

function SetupCard({ project, guide }: { project: Project; guide: NonNullable<ReturnType<typeof buildCompanionGuide>> }) {
  const tk = project.scene.takeoff!, sj = project.scene.subject!;
  const first = guide.steps[0]!;
  const [me, setMe] = useState<{ d: number; b: number; acc: number } | null>(null);
  const [geoErr, setGeoErr] = useState<string | null>(null);
  const locate = () => {
    if (!navigator.geolocation) return setGeoErr("Géolocalisation indisponible sur cet appareil.");
    navigator.geolocation.getCurrentPosition(
      (p) => { const here = { lat: p.coords.latitude, lon: p.coords.longitude }; setMe({ d: haversineDistanceM(here, tk.position), b: initialBearingDeg(here, tk.position), acc: p.coords.accuracy }); setGeoErr(null); },
      (e) => setGeoErr(e.code === 1 ? "Autorisation de localisation refusée." : "Position indisponible."),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };
  const sjFromTk = { d: haversineDistanceM(tk.position, sj.position), b: initialBearingDeg(tk.position, sj.position) };
  return (
    <section className="panel space-y-4 p-4">
      <h2 className="text-base font-semibold">Mise en place</h2>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <Info label="Décollage" value={formatLatLon(tk.position, 5)} />
        <Info label="Sujet" value={`${Math.round(sjFromTk.d)} m au ${compassLabel(sjFromTk.b)} du décollage`} />
      </div>
      <div className="flex flex-wrap gap-2">
        <a className="btn h-10" href={`https://maps.apple.com/?ll=${tk.position.lat},${tk.position.lon}&q=D%C3%A9collage`} target="_blank" rel="noreferrer"><ExternalLink size={14} />Ouvrir dans Plans</a>
        <button className="btn h-10" onClick={locate}><LocateFixed size={14} />Me situer</button>
      </div>
      {me && <p className="text-sm">Vous êtes à <b>{Math.round(me.d)} m</b> du point de décollage (direction {compassLabel(me.b)}, précision ± {Math.round(me.acc)} m).</p>}
      {geoErr && <p className="text-xs text-danger">{geoErr}</p>}
      <div className="rounded-lg border border-line bg-bg/40 p-3 text-sm">
        <div className="label mb-1.5">Position de départ du plan 1</div>
        Décollez, puis placez le Neo 2 à <b>{Math.round(first.start.distanceToSubjectM)} m au {first.start.bearingLabel}</b> du sujet, à <b>H {Math.round(first.start.heightTakeoffM)} m</b>, caméra vers le {first.start.cameraHeadingLabel}, nacelle {Math.round(first.start.gimbalPitchDeg)}°.
      </div>
      <p className="text-xs text-faint">Durée totale indicative {Math.round(guide.totalDurationS)} s · hauteur max {Math.round(guide.maxHeightTakeoffM)} m · éloignement max {Math.round(guide.maxDistanceFromTakeoffM)} m.</p>
    </section>
  );
}

function StepCard({ s, total, printMode }: { s: CompanionStep; total: number; printMode?: boolean }) {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);
  useEffect(() => {
    if (!running) return;
    startedAt.current = performance.now() - elapsed * 1000;
    let raf = 0;
    const loop = () => {
      const e = (performance.now() - startedAt.current) / 1000;
      setElapsed(e);
      if (e >= s.durationS) { setRunning(false); navigator.vibrate?.([120, 60, 120]); return; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running]); // eslint-disable-line react-hooks/exhaustive-deps
  const reset = useCallback(() => { setRunning(false); setElapsed(0); }, []);
  const r = Math.round;

  return (
    <section className={`panel space-y-4 p-4 ${printMode ? "mb-4 break-inside-avoid" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="label">Plan {s.index + 1} / {total}{s.transitionInS ? ` · après ${s.transitionInS} s de transition` : ""}</div>
          <h2 className="text-lg font-semibold">{s.title}</h2>
          <p className="text-xs text-muted">{s.description}</p>
        </div>
        <div className="text-right"><div className="mono text-2xl">{r(s.durationS)}<span className="text-sm text-faint"> s</span></div><div className="text-[10px] text-faint">indicatif</div></div>
      </div>

      <StepPreview s={s} />

      <div className="grid grid-cols-2 gap-2">
        <CueBox title="Départ" tone="text-ok" c={s.start} />
        <CueBox title="Arrivée" tone="text-danger" c={s.end} />
      </div>
      <p className="mono text-xs text-muted">Trajet ≈ {r(s.distanceM)} m · {s.avgSpeedMs.toFixed(1)} m/s en moyenne (max {s.maxSpeedMs.toFixed(1)}){s.subjectMovesM > 5 ? ` · sujet ${r(s.subjectMovesM)} m` : ""}</p>

      <div>
        <div className="label mb-1.5">Mouvement à reproduire</div>
        <ul className="space-y-1.5 text-sm">{s.sticks.map((x) => <li key={x} className="flex gap-2"><ArrowRight size={14} className="mt-1 shrink-0 text-cyan" />{x}</li>)}</ul>
      </div>
      {s.nativeMode && <p className="flex gap-2 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-xs text-muted"><Sparkles size={14} className="mt-0.5 shrink-0 text-cyan" />{s.nativeMode.note}</p>}
      {s.tips.map((t) => <p key={t} className="flex gap-2 text-xs text-warn"><TriangleAlert size={14} className="mt-0.5 shrink-0" />{t}</p>)}

      {!printMode && (
        <div className="rounded-lg border border-line bg-bg/40 p-3">
          <div className="mb-2 flex items-center justify-between text-xs text-muted"><span>Minuteur de répétition</span><span className="mono">{elapsed.toFixed(1)} / {r(s.durationS)} s</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-3"><div className="h-full bg-cyan transition-[width]" style={{ width: `${Math.min(100, (elapsed / s.durationS) * 100)}%` }} /></div>
          <div className="mt-2 flex gap-2">
            <button className="btn h-10 flex-1 justify-center" onClick={() => { if (elapsed >= s.durationS) setElapsed(0); setRunning((x) => !x); }}>{running ? <><Pause size={15} />Pause</> : <><Play size={15} />{elapsed > 0 && elapsed < s.durationS ? "Reprendre" : "Démarrer"}</>}</button>
            <button className="btn h-10 px-3" onClick={reset} aria-label="Remettre à zéro"><RotateCcw size={15} /></button>
          </div>
        </div>
      )}
    </section>
  );
}

function CueBox({ title, tone, c }: { title: string; tone: string; c: CompanionStep["start"] }) {
  const r = Math.round;
  return (
    <div className="rounded-lg border border-line bg-bg/40 p-2.5 text-xs">
      <div className={`label mb-1 ${tone}`}>{title}</div>
      <div className="mono text-lg leading-tight text-text">H {r(c.heightTakeoffM)} m</div>
      <div>{r(c.distanceToSubjectM)} m au {c.bearingLabel} du sujet</div>
      <div className="text-muted">Caméra → {c.cameraHeadingLabel}</div>
      <div className="text-muted">Nacelle {r(c.gimbalPitchDeg)}°</div>
    </div>
  );
}

function StepPreview({ s }: { s: CompanionStep }) {
  const P = (p: { x: number; y: number }) => `${(p.x * 300).toFixed(1)},${(p.y * 160).toFixed(1)}`;
  const d = s.preview.drone, sj = s.preview.subject;
  const moving = Math.hypot(sj[0]!.x - sj[sj.length - 1]!.x, sj[0]!.y - sj[sj.length - 1]!.y) > 0.02;
  return (
    <svg viewBox="0 0 300 160" className="w-full rounded-lg bg-bg" role="img" aria-label="Vue de dessus du plan">
      <text x="6" y="14" fontSize="9" fill="#5b6678">N ↑ · vue de dessus</text>
      {moving ? <polyline points={sj.map(P).join(" ")} fill="none" stroke="#e9eef6" strokeOpacity=".35" strokeDasharray="3 3" /> : null}
      <circle cx={sj[0]!.x * 300} cy={sj[0]!.y * 160} r="4.5" fill="#f5b84a" />
      <polyline points={d.map(P).join(" ")} fill="none" stroke="#2ad4ee" strokeWidth="2" />
      <circle cx={d[0]!.x * 300} cy={d[0]!.y * 160} r="5" fill="#3ddc97" />
      <circle cx={d[d.length - 1]!.x * 300} cy={d[d.length - 1]!.y * 160} r="5" fill="#ff5d6c" />
    </svg>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-line bg-bg/40 px-2.5 py-2"><div className="text-[10px] text-faint">{label}</div><div className="text-xs">{value}</div></div>;
}
