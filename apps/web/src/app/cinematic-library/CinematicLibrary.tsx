"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookmarkPlus, Check, Clapperboard, Trash2, X } from "lucide-react";
import { MOVES, MOVES_BY_ID, defaultParams, previewMove, sanitizeParams, type MoveCategory, type MoveDefinition, type Params } from "@dfs/cinematic-engine";
import { PageHeader } from "@/components/PageHeader";
import { NumberField, ProjectPicker } from "@/components/workspace/Kit";
import { withHistory } from "@/lib/projects";
import { useActiveProject } from "@/lib/useActiveProject";
import { useStudio } from "@/lib/store";
import { getSupabase } from "@/lib/supabase";

const CATS: { id: MoveCategory | "all"; label: string }[] = [
  { id: "all", label: "Tous" }, { id: "orbite", label: "Orbites" }, { id: "révélation", label: "Révélations" },
  { id: "travelling", label: "Travellings" }, { id: "vertical", label: "Verticaux" }, { id: "suivi", label: "Suivis" },
];

interface Preset { id: string; moveId: string; name: string; params: Params }
const LS = "dfs.presets.v1";

function usePresets() {
  const { session } = useStudio();
  const sb = getSupabase();
  const [presets, setPresets] = useState<Preset[]>([]);
  const cloud = Boolean(sb && session);
  const refresh = useCallback(async () => {
    if (sb && session) {
      const { data } = await sb.from("cinematic_presets").select("id, move_type, name, params").eq("owner_id", session.user.id).order("created_at", { ascending: false });
      setPresets((data ?? []).map((r) => ({ id: r.id, moveId: r.move_type, name: r.name, params: r.params as Params })));
    } else {
      try { setPresets(JSON.parse(localStorage.getItem(LS) ?? "[]")); } catch { setPresets([]); }
    }
  }, [sb, session]);
  useEffect(() => { void refresh(); }, [refresh]);
  const add = async (p: Omit<Preset, "id">) => {
    if (sb && session) {
      const { error } = await sb.from("cinematic_presets").insert({ owner_id: session.user.id, move_type: p.moveId, name: p.name, params: p.params });
      if (error) throw new Error(error.message);
    } else localStorage.setItem(LS, JSON.stringify([{ ...p, id: crypto.randomUUID() }, ...presets].slice(0, 100)));
    await refresh();
  };
  const remove = async (id: string) => {
    if (sb && session) await sb.from("cinematic_presets").delete().eq("id", id);
    else localStorage.setItem(LS, JSON.stringify(presets.filter((p) => p.id !== id)));
    await refresh();
  };
  return { presets, add, remove, cloud };
}

export function CinematicLibrary() {
  const [cat, setCat] = useState<MoveCategory | "all">("all");
  const [open, setOpen] = useState<MoveDefinition | null>(null);
  const list = MOVES.filter((m) => cat === "all" || m.category === cat);
  return (
    <>
      <PageHeader eyebrow="Cinematic Library" title="Mouvements cinématiques"
        description="20 mouvements paramétrables + la trajectoire personnalisée. Chaque aperçu est calculé par le moteur cinématique : c'est exactement la trajectoire qui sera simulée (vue de dessus, puis profil hauteur / distance au sujet)." />
      <div className="mb-4 flex flex-wrap gap-1">
        {CATS.map((c) => <button key={c.id} className={`btn h-8 text-xs ${cat === c.id ? "border-accent/60 bg-surface-3" : "text-muted"}`} onClick={() => setCat(c.id)}>{c.label}</button>)}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {list.map((m) => (
          <button key={m.id} onClick={() => setOpen(m)} className="panel group p-3 text-left transition-colors hover:border-accent/40">
            <MovePreviewSvg moveId={m.id} />
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{m.name}</span>
              <span className="tag">{m.category}</span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-faint">{m.description}</p>
          </button>
        ))}
      </div>
      {open && <MoveSheet move={open} onClose={() => setOpen(null)} />}
    </>
  );
}

/** Animated SVG built from the engine samples (top view + side profile). */
export function MovePreviewSvg({ moveId, params, height = 120 }: { moveId: string; params?: Params; height?: number }) {
  const pv = useMemo(() => previewMove(moveId, params), [moveId, params]);
  if (!pv) return null;
  const W = 200, H = 120;
  const top = pv.top.map((p) => `${(p.x * 120).toFixed(1)},${(p.y * H).toFixed(1)}`);
  const side = pv.side.map((p) => `${(128 + p.x * 70).toFixed(1)},${(10 + p.y * 100).toFixed(1)}`);
  const dur = `${(MOVES_BY_ID[moveId]?.defaultDurationS ?? 10) / 2.5}s`;
  const s0 = pv.subjectTop[0]!, s1 = pv.subjectTop[pv.subjectTop.length - 1]!;
  const moving = Math.hypot(s1.x - s0.x, s1.y - s0.y) > 0.01;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ height }} className="w-full rounded-lg bg-bg" aria-hidden>
      <line x1="124" y1="8" x2="124" y2="112" stroke="rgb(148 163 184 / .12)" />
      <line x1="128" y1="110" x2="198" y2="110" stroke="rgb(148 163 184 / .25)" />
      <text x="4" y="114" fontSize="7" fill="#5b6678">dessus</text>
      <text x="196" y="118" fontSize="7" fill="#5b6678" textAnchor="end">profil</text>
      {moving
        ? <polyline points={pv.subjectTop.map((p) => `${(p.x * 120).toFixed(1)},${(p.y * H).toFixed(1)}`).join(" ")} fill="none" stroke="#e9eef6" strokeOpacity=".25" strokeDasharray="2 2" />
        : <circle cx={s0.x * 120} cy={s0.y * H} r="3.2" fill="#e9eef6" />}
      <polyline points={top.join(" ")} fill="none" stroke="#2e9bff" strokeOpacity=".55" strokeWidth="1.3" />
      <polyline points={side.join(" ")} fill="none" stroke="#2e9bff" strokeOpacity=".55" strokeWidth="1.3" />
      <circle r="3.6" fill="#2ad4ee"><animateMotion dur={dur} repeatCount="indefinite" path={`M${top.join(" L")}`} /></circle>
      <circle r="3" fill="#2ad4ee"><animateMotion dur={dur} repeatCount="indefinite" path={`M${side.join(" L")}`} /></circle>
      {moving && <circle r="2.6" fill="#e9eef6"><animateMotion dur={dur} repeatCount="indefinite" path={`M${pv.subjectTop.map((p) => `${(p.x * 120).toFixed(1)},${(p.y * H).toFixed(1)}`).join(" L")}`} /></circle>}
    </svg>
  );
}

function MoveSheet({ move, onClose }: { move: MoveDefinition; onClose(): void }) {
  const { save } = useStudio();
  const { active, project, projectId, setProjectId } = useActiveProject();
  const { presets, add, remove, cloud } = usePresets();
  const [params, setParams] = useState<Params>(() => defaultParams(move.id));
  const [duration, setDuration] = useState(move.defaultDurationS);
  const [done, setDone] = useState<string | null>(null);
  const mine = presets.filter((p) => p.moveId === move.id);

  async function addToTimeline() {
    if (!project) return;
    const shot = { id: crypto.randomUUID(), moveId: move.id, durationS: duration, transitionS: project.timeline.length ? 2 : 0, params: sanitizeParams(move.id, params) };
    await save(withHistory({ ...project, timeline: [...project.timeline, shot] }, `Plan ajouté : ${move.name}`));
    setDone(`Ajouté à « ${project.name} » (plan ${project.timeline.length + 1}).`);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" role="dialog" aria-modal="true" aria-label={move.name} onClick={onClose}>
      <div className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-line bg-surface p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div><div className="label">{move.category}</div><h2 className="text-lg font-semibold">{move.name}</h2></div>
          <button className="btn h-8 w-8 justify-center p-0" onClick={onClose} aria-label="Fermer"><X size={16} /></button>
        </div>
        <MovePreviewSvg moveId={move.id} params={params} height={150} />
        <p className="mt-2 text-xs text-muted">{move.description}{move.movingSubject && " Le sujet suit le parcours GPX du projet s'il est placé dessus, sinon une ligne droite."}</p>

        <div className="mt-4 space-y-3">
          <NumberField label="Durée du plan" unit="s" min={2} max={120} value={duration} onChange={setDuration} />
          {move.params.map((p) => p.kind === "number" ? (
            <NumberField key={p.key} label={p.label} unit={p.unit} min={p.min} max={p.max} step={p.step} value={params[p.key] as number} onChange={(v) => setParams((s) => ({ ...s, [p.key]: v }))} />
          ) : p.kind === "select" ? (
            <label key={p.key} className="block text-[11px] text-muted">{p.label}
              <select className="input mt-1 h-8 text-xs" value={String(params[p.key])} onChange={(e) => setParams((s) => ({ ...s, [p.key]: e.target.value }))}>
                {p.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          ) : (
            <label key={p.key} className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={Boolean(params[p.key])} onChange={(e) => setParams((s) => ({ ...s, [p.key]: e.target.checked }))} className="accent-[var(--color-cyan)]" />{p.label}
            </label>
          ))}
        </div>

        <div className="mt-5 space-y-2 border-t border-line pt-4">
          <div className="label">Ajouter au plan de tournage</div>
          <ProjectPicker active={active} projectId={projectId} onChange={setProjectId} />
          <button className="btn btn-primary w-full justify-center" disabled={!project} onClick={addToTimeline}><Clapperboard size={15} />Ajouter à la timeline</button>
          {done && <p className="flex items-center gap-1.5 text-xs text-ok" role="status"><Check size={13} />{done} <Link className="text-cyan hover:underline" href="/timeline">Ouvrir la timeline</Link></p>}
        </div>

        <div className="mt-5 space-y-2 border-t border-line pt-4">
          <div className="flex items-center justify-between">
            <div className="label">Presets <span className="normal-case tracking-normal text-faint">· {cloud ? "compte" : "navigateur"}</span></div>
            <button className="btn h-8 text-xs" onClick={() => add({ moveId: move.id, name: `${move.name} ${new Date().toLocaleDateString("fr-FR")} ${mine.length + 1}`, params: sanitizeParams(move.id, params) })}><BookmarkPlus size={13} />Enregistrer</button>
          </div>
          {mine.length === 0 ? <p className="text-xs text-faint">Aucun preset pour ce mouvement.</p> : (
            <ul className="space-y-1">{mine.map((p) => (
              <li key={p.id} className="flex items-center gap-2 text-xs">
                <button className="flex-1 truncate rounded px-1 py-1 text-left hover:bg-surface-2" onClick={() => setParams({ ...defaultParams(move.id), ...sanitizeParams(move.id, p.params) })}>{p.name}</button>
                <button className="text-faint hover:text-danger" onClick={() => remove(p.id)} aria-label={`Supprimer ${p.name}`}><Trash2 size={13} /></button>
              </li>
            ))}</ul>
          )}
        </div>
      </div>
    </div>
  );
}
