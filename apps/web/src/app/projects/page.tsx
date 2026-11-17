"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Archive, ArchiveRestore, Copy, FileUp, FolderPlus, MapPin } from "lucide-react";
import { formatLatLon } from "@dfs/geographic-engine";
import { PageHeader } from "@/components/PageHeader";
import { createProject, duplicateProject, importProject, withHistory } from "@/lib/projects";
import { formatDate, useStudio } from "@/lib/store";

export default function ProjectsPage() {
  const { projects, loading, save, repo, warnings } = useStudio();
  const router = useRouter();
  const [name, setName] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const list = projects.filter((p) => p.archived === showArchived);

  async function run(fn: () => Promise<void>, ok?: string) {
    try { await fn(); if (ok) setMsg({ kind: "ok", text: ok }); }
    catch (e) { setMsg({ kind: "err", text: (e as Error).message }); }
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    await run(async () => {
      const p = createProject(name);
      await save(p);
      router.push(`/projects/${p.id}`);
    });
  }

  async function onImport(file: File) {
    await run(async () => {
      const p = importProject(await file.text());
      await save(p);
    }, `« ${file.name} » importé.`);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <>
      <PageHeader
        eyebrow="Project Manager"
        title="Projets"
        description={repo?.kind === "cloud" ? "Vos projets sont enregistrés dans votre compte (Supabase, accès protégé par RLS)." : "Mode invité : les projets sont enregistrés dans ce navigateur uniquement. Connectez-vous dans Settings pour les synchroniser."}
        actions={<>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
          <button className="btn" onClick={() => fileRef.current?.click()} disabled={!repo}><FileUp size={16} />Importer JSON</button>
        </>}
      />

      <form onSubmit={onCreate} className="panel mb-4 flex flex-col gap-3 p-4 sm:flex-row">
        <label className="sr-only" htmlFor="pname">Nom du projet</label>
        <input id="pname" className="input" placeholder="Nom du nouveau projet — ex. « Crête du Brévent au coucher du soleil »" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        <button className="btn btn-primary justify-center" disabled={!repo}><FolderPlus size={16} />New Project</button>
      </form>

      {msg && <div className={`panel mb-4 p-3 text-sm ${msg.kind === "ok" ? "text-ok" : "text-danger"}`} role="status">{msg.text}</div>}
      {warnings.map((w) => <div key={w} className="panel mb-2 p-3 text-xs text-warn">{w}</div>)}

      <div className="mb-3 flex gap-1">
        {[false, true].map((a) => (
          <button key={String(a)} onClick={() => setShowArchived(a)} className={`btn h-8 ${showArchived === a ? "border-accent/60 text-text" : "text-muted"}`}>
            {a ? "Archivés" : "Actifs"} <span className="mono text-faint">{projects.filter((p) => p.archived === a).length}</span>
          </button>
        ))}
      </div>

      <div className="panel overflow-hidden">
        {loading ? <div className="p-10 text-center text-sm text-faint">Chargement…</div>
          : list.length === 0 ? <div className="p-10 text-center text-sm text-faint">{showArchived ? "Aucun projet archivé." : "Aucun projet actif."}</div>
          : (
            <ul className="divide-y divide-line">
              {list.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <MapPin size={16} className="shrink-0 text-cyan" />
                  <Link href={`/projects/${p.id}`} className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium hover:text-cyan">{p.name}</div>
                    <div className="truncate text-xs text-faint">
                      {p.environment.kind === "real" ? formatLatLon(p.environment.center, 3) : p.environment.kind === "virtual" ? "Virtuel" : "Sans environnement"} · {p.waypoints.length} wp · modifié {formatDate(p.updatedAt)}
                    </div>
                  </Link>
                  <button className="btn h-8 px-2.5" title="Dupliquer" aria-label={`Dupliquer ${p.name}`} onClick={() => run(() => save(duplicateProject(p)), "Projet dupliqué.")}><Copy size={14} /></button>
                  <button className="btn h-8 px-2.5" title={p.archived ? "Restaurer" : "Archiver"} aria-label={p.archived ? `Restaurer ${p.name}` : `Archiver ${p.name}`}
                    onClick={() => run(() => save(withHistory({ ...p, archived: !p.archived }, p.archived ? "Restauré" : "Archivé")))}>
                    {p.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                  </button>
                </li>
              ))}
            </ul>
          )}
      </div>
    </>
  );
}
