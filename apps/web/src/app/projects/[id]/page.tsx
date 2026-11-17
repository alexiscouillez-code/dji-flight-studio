"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Copy, Download, Save, Trash2 } from "lucide-react";
import { CheckItem } from "@/components/CheckItem";
import type { Environment, Project } from "@dfs/shared-types";
import { DRONE_PROFILES } from "@dfs/drone-adapters";
import { formatLatLon, parseCoordinates } from "@dfs/geographic-engine";
import { evaluateMission, LEVEL_ORDER, SAFETY_DISCLAIMER } from "@dfs/flight-safety";
import { computeTrajectory } from "@dfs/trajectory-engine";
import { PageHeader } from "@/components/PageHeader";
import { downloadText, duplicateProject, exportProject, slugify, withHistory } from "@/lib/projects";
import { formatDate, useStudio } from "@/lib/store";

const VIRTUAL_PRESETS = { studio: "Studio neutre", valley: "Vallée fictive", "test-mountain": "Montagne de test", forest: "Environnement forestier", "sim-ground": "Terrain de simulation" } as const;

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { projects, loading, save, remove } = useStudio();
  const project = projects.find((p) => p.id === id);

  if (loading) return <div className="p-10 text-center text-sm text-faint">Chargement…</div>;
  if (!project) return (
    <div className="panel mx-auto max-w-md p-8 text-center">
      <h1 className="text-lg font-semibold">Projet introuvable</h1>
      <p className="mt-2 text-sm text-muted">Il a peut-être été supprimé, ou il est stocké dans un autre espace (local / compte).</p>
      <Link href="/projects" className="btn mt-6"><ArrowLeft size={15} />Projets</Link>
    </div>
  );
  return <Editor key={project.id + project.updatedAt} project={project} save={save} remove={async () => { await remove(project.id); router.push("/projects"); }} onDuplicate={async () => { const d = duplicateProject(project); await save(d); router.push(`/projects/${d.id}`); }} />;
}

function Editor({ project, save, remove, onDuplicate }: { project: Project; save: (p: Project) => Promise<void>; remove: () => Promise<void>; onDuplicate: () => Promise<void> }) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [envKind, setEnvKind] = useState<Environment["kind"]>(project.environment.kind);
  const [coords, setCoords] = useState(project.environment.kind === "real" ? `${+project.environment.center.lat.toFixed(6)}, ${+project.environment.center.lon.toFixed(6)}` : "");
  const [placeLabel, setPlaceLabel] = useState(project.environment.kind === "real" ? project.environment.label ?? "" : "");
  const [preset, setPreset] = useState<keyof typeof VIRTUAL_PRESETS>(project.environment.kind === "virtual" ? project.environment.preset : "studio");
  const [drone, setDrone] = useState(project.droneProfileId);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const parsed = useMemo(() => (envKind === "real" ? parseCoordinates(coords) : null), [envKind, coords]);
  const coordsError = envKind === "real" && coords.trim() !== "" && !parsed;

  const draftEnv: Environment | null =
    envKind === "none" ? { kind: "none" }
      : envKind === "virtual" ? { kind: "virtual", preset }
      : parsed ? { kind: "real", center: parsed, ...(placeLabel.trim() ? { label: placeLabel.trim() } : {}) } : null;

  const dirty = name !== project.name || description !== project.description || drone !== project.droneProfileId ||
    JSON.stringify(draftEnv) !== JSON.stringify(project.environment);

  const checks = useMemo(() => evaluateMission({ ...project, droneProfileId: drone }).sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]), [project, drone]);
  const traj = useMemo(() => { try { return computeTrajectory(project.waypoints, { interpolation: project.interpolation }); } catch { return null; } }, [project]);

  useEffect(() => { if (status?.kind === "ok") { const t = setTimeout(() => setStatus(null), 2500); return () => clearTimeout(t); } }, [status]);

  async function onSave(e?: React.FormEvent) {
    e?.preventDefault();
    if (!name.trim()) return setStatus({ kind: "err", text: "Le nom est obligatoire." });
    if (!draftEnv) return setStatus({ kind: "err", text: "Coordonnées invalides : saisissez « latitude, longitude » (ex. 45.8326, 6.8652)." });
    const changes: string[] = [];
    if (name !== project.name) changes.push("renommé");
    if (description !== project.description) changes.push("description");
    if (JSON.stringify(draftEnv) !== JSON.stringify(project.environment)) changes.push("environnement");
    if (drone !== project.droneProfileId) changes.push("drone");
    try {
      await save(withHistory({ ...project, name: name.trim(), description, environment: draftEnv, droneProfileId: drone }, `Modifié : ${changes.join(", ")}`));
      setStatus({ kind: "ok", text: "Enregistré." });
    } catch (err) { setStatus({ kind: "err", text: (err as Error).message }); }
  }

  return (
    <>
      <Link href="/projects" className="mb-4 inline-flex items-center gap-1 text-xs text-muted hover:text-text"><ArrowLeft size={13} />Projets</Link>
      <PageHeader eyebrow={project.archived ? "Projet · archivé" : "Projet"} title={project.name}
        description={<>Créé {formatDate(project.createdAt)} · modifié {formatDate(project.updatedAt)} · format v{project.schemaVersion}</>}
        actions={<>
          <button className="btn" onClick={() => downloadText(`${slugify(project.name)}.dfs.json`, exportProject(project))}><Download size={15} />Exporter JSON</button>
          <button className="btn" onClick={() => onDuplicate().catch((e) => setStatus({ kind: "err", text: e.message }))}><Copy size={15} />Dupliquer</button>
        </>} />

      <div className="grid gap-4 xl:grid-cols-3">
        <form onSubmit={onSave} className="panel space-y-5 p-5 xl:col-span-2">
          <div>
            <label className="label mb-2 block" htmlFor="n">Nom</label>
            <input id="n" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </div>
          <div>
            <label className="label mb-2 block" htmlFor="d">Description</label>
            <textarea id="d" className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} placeholder="Intention, sujet, lumière, contraintes du lieu…" />
          </div>

          <fieldset>
            <legend className="label mb-2">Environnement</legend>
            <div className="mb-3 flex flex-wrap gap-1">
              {(["real", "virtual", "none"] as const).map((k) => (
                <button type="button" key={k} onClick={() => setEnvKind(k)} className={`btn h-8 ${envKind === k ? "border-accent/60 bg-surface-3" : "text-muted"}`}>
                  {k === "real" ? "Lieu réel" : k === "virtual" ? "Virtuel" : "Aucun"}
                </button>
              ))}
            </div>
            {envKind === "real" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-muted" htmlFor="c">Coordonnées (décimal ou DMS)</label>
                  <input id="c" className={`input mono ${coordsError ? "border-danger" : ""}`} value={coords} onChange={(e) => setCoords(e.target.value)} placeholder="45.8326, 6.8652" aria-invalid={coordsError} />
                  <div className={`mt-1 text-xs ${coordsError ? "text-danger" : "text-faint"}`}>
                    {coordsError ? "Format non reconnu." : parsed ? formatLatLon(parsed) : "Recherche par nom de lieu : Phase 2 (géocodage)."}
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted" htmlFor="pl">Nom du lieu</label>
                  <input id="pl" className="input" value={placeLabel} onChange={(e) => setPlaceLabel(e.target.value)} placeholder="Mont Blanc" maxLength={200} />
                </div>
              </div>
            )}
            {envKind === "virtual" && (
              <select className="input" value={preset} onChange={(e) => setPreset(e.target.value as keyof typeof VIRTUAL_PRESETS)} aria-label="Environnement virtuel">
                {Object.entries(VIRTUAL_PRESETS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            )}
          </fieldset>

          <div>
            <label className="label mb-2 block" htmlFor="dr">Drone</label>
            <select id="dr" className="input" value={drone} onChange={(e) => setDrone(e.target.value)}>
              {Object.values(DRONE_PROFILES).map((p) => <option key={p.id} value={p.id}>{p.name} — {p.mode === "manual-companion" ? "Companion manuel" : "SDK"}</option>)}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <button className="btn btn-primary" disabled={!dirty}><Save size={15} />Enregistrer</button>
            {status && <span className={`text-sm ${status.kind === "ok" ? "text-ok" : "text-danger"}`} role="status">{status.text}</span>}
            <div className="ml-auto">
              {confirmDelete ? (
                <span className="flex items-center gap-2 text-sm">
                  Supprimer définitivement ?
                  <button type="button" className="btn btn-danger h-8" onClick={() => remove().catch((e) => setStatus({ kind: "err", text: e.message }))}>Oui, supprimer</button>
                  <button type="button" className="btn h-8" onClick={() => setConfirmDelete(false)}>Annuler</button>
                </span>
              ) : <button type="button" className="btn btn-danger" onClick={() => setConfirmDelete(true)}><Trash2 size={15} />Supprimer</button>}
            </div>
          </div>
        </form>

        <div className="space-y-4">
          <section className="panel p-5">
            <h2 className="label mb-3">Trajectoire</h2>
            {project.waypoints.length === 0 ? (
              <p className="text-sm text-muted">Aucun waypoint. L'éditeur visuel de trajectoire arrive avec le <Link className="text-cyan hover:underline" href="/flight-designer">Flight Designer</Link> (Phase 3). Le moteur de calcul est déjà prêt et testé.</p>
            ) : traj ? (
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-xs text-faint">Distance</dt><dd className="mono">{traj.totalDistanceM.toFixed(0)} m</dd></div>
                <div><dt className="text-xs text-faint">Durée estimée</dt><dd className="mono">{traj.estimatedDurationS.toFixed(0)} s</dd></div>
                <div className="col-span-2 text-[11px] text-warn">Estimations de simulation — pas des performances réelles.</div>
              </dl>
            ) : <p className="text-sm text-danger">Trajectoire incohérente (référentiels d'altitude mélangés).</p>}
          </section>

          <section className="panel p-5">
            <h2 className="label mb-3">Vérifications pré-vol</h2>
            <ul className="space-y-3">{checks.map((c) => <CheckItem key={c.id} level={c.level} title={c.title} detail={c.detail} />)}</ul>
            <p className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-faint">{SAFETY_DISCLAIMER}</p>
          </section>

          <section className="panel p-5">
            <h2 className="label mb-3">Historique</h2>
            <ol className="max-h-56 space-y-2 overflow-auto text-xs">
              {[...project.history].reverse().map((h, i) => <li key={i} className="flex gap-3"><span className="mono shrink-0 text-faint">{formatDate(h.at)}</span><span className="text-muted">{h.action}</span></li>)}
            </ol>
          </section>
        </div>
      </div>
    </>
  );
}

