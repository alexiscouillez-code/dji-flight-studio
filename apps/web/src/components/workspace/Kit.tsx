"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Crosshair, Eye, X } from "lucide-react";
import type { Project } from "@dfs/shared-types";
import type { PickMode } from "@/components/globe/GlobeView";

/** Floating side panel on desktop, collapsible bottom sheet on mobile. */
export function Panel({ title, children, side = "left", width = 360 }: { title: ReactNode; children: ReactNode; side?: "left" | "right"; width?: number }) {
  const [open, setOpen] = useState(true);
  useEffect(() => { if (window.innerWidth < 1024) setOpen(false); }, []);
  return (
    <aside style={{ ["--w" as string]: `${width}px` }} className={`absolute z-10 flex flex-col border-line bg-surface/92 backdrop-blur-md
      inset-x-0 bottom-0 max-h-[55dvh] rounded-t-2xl border-t
      lg:inset-x-auto lg:bottom-3 lg:top-3 lg:max-h-none lg:w-[var(--w)] lg:rounded-2xl lg:border ${side === "left" ? "lg:left-3" : "lg:right-3"} ${open ? "" : "max-lg:max-h-14"}`}>
      <button className="flex items-center justify-between px-4 py-3 lg:cursor-default" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="label">{title}</span>
        <span className="text-faint lg:hidden">{open ? <ChevronDown size={16} /> : <ChevronUp size={16} />}</span>
      </button>
      <div className={`min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-4 ${open ? "" : "max-lg:hidden"}`}>{children}</div>
    </aside>
  );
}

export function ProjectPicker({ active, projectId, onChange }: { active: Project[]; projectId: string; onChange(id: string): void }) {
  if (!active.length) return <p className="text-sm text-muted">Aucun projet. <Link className="text-cyan hover:underline" href="/projects">Créer un projet</Link></p>;
  return (
    <div className="flex gap-2">
      <label className="sr-only" htmlFor="ws-project">Projet</label>
      <select id="ws-project" className="input h-9" value={projectId} onChange={(e) => onChange(e.target.value)}>
        {active.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      {projectId && <Link className="btn h-9 px-2.5" href={`/projects/${projectId}`} aria-label="Ouvrir le projet" title="Ouvrir le projet"><Eye size={15} /></Link>}
    </div>
  );
}

export function PlacementButtons({ project, pickMode, setPickMode }: { project: Project | null; pickMode: PickMode; setPickMode(m: PickMode): void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {(["takeoff", "subject"] as const).map((m) => {
        const pt = project?.scene[m];
        return (
          <button key={m} className={`btn h-auto flex-col items-start gap-0.5 py-2 text-left ${pickMode === m ? "border-cyan/70" : ""}`} disabled={!project} onClick={() => setPickMode(pickMode === m ? null : m)}>
            <span className="flex items-center gap-1.5 text-xs"><Crosshair size={13} className={m === "takeoff" ? "text-accent" : "text-warn"} />{m === "takeoff" ? "Décollage" : "Sujet"}</span>
            <span className="mono text-[10px] text-faint">{pt ? (pt.terrain ? `sol ${Math.round(pt.terrain.valueM)} m` : "placé") : "à placer"}</span>
          </button>
        );
      })}
    </div>
  );
}

export function PickBanner({ pickMode, label, onCancel }: { pickMode: string | null; label: string; onCancel(): void }) {
  if (!pickMode) return null;
  return (
    <div className="absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full border border-cyan/40 bg-bg/90 px-4 py-2 text-sm backdrop-blur">
      <Crosshair size={15} className="text-cyan" />{label}
      <button className="text-muted hover:text-text" onClick={onCancel} aria-label="Annuler"><X size={15} /></button>
    </div>
  );
}

export function Toast({ msg, onClose }: { msg: { kind: "ok" | "err" | "warn"; text: string } | null; onClose(): void }) {
  useEffect(() => { if (msg && msg.kind !== "err") { const t = setTimeout(onClose, 5000); return () => clearTimeout(t); } }, [msg, onClose]);
  if (!msg) return null;
  return (
    <div role="status" className={`absolute left-1/2 top-14 z-20 w-[min(92%,520px)] -translate-x-1/2 rounded-lg border bg-bg/90 px-3 py-2 text-sm backdrop-blur ${msg.kind === "ok" ? "border-ok/40 text-ok" : msg.kind === "warn" ? "border-warn/40 text-warn" : "border-danger/40 text-danger"}`}>
      <div className="flex gap-2"><span className="flex-1">{msg.text}</span><button onClick={onClose} aria-label="Fermer"><X size={14} /></button></div>
    </div>
  );
}

export function NumberField({ label, value, onChange, min, max, step = 1, unit }: { label: string; value: number; onChange(v: number): void; min?: number; max?: number; step?: number; unit?: string }) {
  const [txt, setTxt] = useState(String(value));
  useEffect(() => setTxt(String(value)), [value]);
  return (
    <label className="block">
      <span className="mb-1 flex justify-between text-[11px] text-muted"><span>{label}</span>{unit && <span className="text-faint">{unit}</span>}</span>
      <div className="flex items-center gap-2">
        {min !== undefined && max !== undefined && (
          <input type="range" className="flex-1 accent-[var(--color-cyan)]" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
        )}
        <input className="input mono h-8 w-20 px-2 text-xs" inputMode="decimal" value={txt}
          onChange={(e) => setTxt(e.target.value)}
          onBlur={() => { const n = Number(txt.replace(",", ".")); if (Number.isFinite(n)) onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n))); else setTxt(String(value)); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
      </div>
    </label>
  );
}

export function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-bg/40 px-2.5 py-2">
      <div className="text-[10px] text-faint">{label}</div>
      <div className={`mono text-sm ${warn ? "text-warn" : ""}`}>{value}</div>
    </div>
  );
}
