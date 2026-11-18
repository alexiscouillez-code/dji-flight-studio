"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowUpRight, Clock3, FolderPlus, Globe2, MapPin, PlayCircle, Radio, Route } from "lucide-react";
import { DJI_NEO_2, supportedCapabilities, CAPABILITY_LABELS } from "@dfs/drone-adapters";
import { formatLatLon } from "@dfs/geographic-engine";
import { PageHeader } from "@/components/PageHeader";
import { StatusTag } from "@/components/StatusTag";
import { MoveGlyph, type GlyphKind } from "@/components/MoveGlyph";
import { MODULES } from "@/lib/modules";
import { createProject } from "@/lib/projects";
import { formatDate, useStudio } from "@/lib/store";

const MOVES: { name: string; glyph: GlyphKind; hint: string }[] = [
  { name: "Orbit 360", glyph: "orbit", hint: "Rotation complète autour du sujet, distance constante." },
  { name: "Ascend", glyph: "ascend", hint: "Montée verticale qui ouvre l'horizon." },
  { name: "Push In", glyph: "push", hint: "Approche progressive vers le sujet." },
  { name: "Pull Out", glyph: "pull", hint: "Recul en diagonale pour révéler le contexte." },
  { name: "Side Track", glyph: "track", hint: "Travelling latéral parallèle au sujet." },
  { name: "Mountain Reveal", glyph: "reveal", hint: "Passage d'arête qui dévoile la vallée." },
];

export default function Dashboard() {
  const { projects, loading, save, repo, error } = useStudio();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const active = projects.filter((p) => !p.archived);
  const recent = active.slice(0, 5);
  const withWaypoints = active.filter((p) => p.waypoints.length > 0);
  const lastEnv = active.find((p) => p.environment.kind !== "none");

  async function newProject() {
    setBusy(true);
    try {
      const p = createProject(`Nouveau projet ${active.length + 1}`);
      await save(p);
      router.push(`/projects/${p.id}`);
    } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader
        eyebrow="Dashboard"
        title="Préparez vos plans comme une scène de cinéma"
        description="Lieu réel, relief, trajectoire, cadrage, simulation — puis reproduction avec votre matériel. Les indicateurs ci-dessous sont réels : rien n'est simulé sans être signalé."
        actions={<>
          <button className="btn btn-primary" onClick={newProject} disabled={busy || !repo}><FolderPlus size={16} />New Project</button>
          <Link className="btn" href="/virtual-world"><Globe2 size={16} />Open Virtual World</Link>
          <Link className="btn" href="/simulator"><PlayCircle size={16} />Flight Simulator<span className="tag ml-1">P3</span></Link>
        </>}
      />

      {error && <div className="panel mb-6 border-danger/40 p-4 text-sm text-danger">{error}</div>}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label="Projets actifs" value={loading ? "—" : String(active.length)} sub={repo?.kind === "cloud" ? "Synchronisés (Supabase)" : "Stockés sur cet appareil"} />
        <Stat label="Missions avec trajectoire" value={loading ? "—" : String(withWaypoints.length)} sub="Projets contenant des waypoints" />
        <Stat label="Dernières simulations" value="0" sub="Simulator disponible en Phase 3" muted />
        <Stat label="Dernier environnement" value={lastEnv ? (lastEnv.environment.kind === "real" ? (lastEnv.environment.label || "Lieu réel") : "Virtuel") : "Aucun"}
          sub={lastEnv?.environment.kind === "real" ? formatLatLon(lastEnv.environment.center, 4) : "Défini dans un projet"} small />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <section className="panel p-5 xl:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="label">Projets récents</h2>
            <Link href="/projects" className="flex items-center gap-1 text-xs text-muted hover:text-text">Tous les projets <ArrowUpRight size={13} /></Link>
          </div>
          {loading ? <div className="py-10 text-center text-sm text-faint">Chargement…</div>
            : recent.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <Route size={28} className="text-faint" />
                <p className="text-sm text-muted">Aucun projet pour l'instant.</p>
                <button className="btn btn-primary" onClick={newProject} disabled={busy || !repo}><FolderPlus size={16} />Créer un premier projet</button>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {recent.map((p) => (
                  <li key={p.id}>
                    <Link href={`/projects/${p.id}`} className="flex items-center gap-4 rounded-lg px-2 py-3 hover:bg-surface-2">
                      <div className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-surface-2"><MapPin size={16} className="text-cyan" /></div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{p.name}</div>
                        <div className="truncate text-xs text-faint">{p.environment.kind === "real" ? formatLatLon(p.environment.center, 3) : p.environment.kind === "virtual" ? "Environnement virtuel" : "Sans environnement"} · {p.waypoints.length} waypoint(s)</div>
                      </div>
                      <div className="hidden items-center gap-1 text-xs text-faint sm:flex"><Clock3 size={12} />{formatDate(p.updatedAt)}</div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
        </section>

        <section className="panel p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="label">Drone & compatibilité</h2>
            <Link href="/drone-connection" className="text-xs text-muted hover:text-text">Fiche</Link>
          </div>
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-surface-2"><Radio size={18} className="text-muted" /></div>
            <div>
              <div className="text-sm font-medium">{DJI_NEO_2.name}</div>
              <div className="text-xs text-faint">+ DJI RC-N2 · iPhone</div>
            </div>
          </div>
          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-muted">Connexion</dt><dd className="text-right">Aucune liaison <span className="block text-[11px] text-faint">Pas de SDK officiel identifié</span></dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Mode</dt><dd><span className="tag tag-accent">Companion manuel</span></dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Capacités</dt><dd className="text-right text-xs">{supportedCapabilities(DJI_NEO_2).map((c) => CAPABILITY_LABELS[c]).join(", ")}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Vérifié le</dt><dd className="mono text-xs">{DJI_NEO_2.verifiedOn}</dd></div>
          </dl>
        </section>
      </div>

      <section className="panel mt-4 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="label">Découvrir les mouvements cinématiques</h2>
          <span className="tag">Bibliothèque · Phase 3</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {MOVES.map((m) => (
            <div key={m.name} className="rounded-xl border border-line bg-surface-2/50 p-3">
              <MoveGlyph kind={m.glyph} />
              <div className="mt-3 text-sm font-medium">{m.name}</div>
              <div className="mt-1 text-xs leading-relaxed text-faint">{m.hint}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-faint">Schémas animés illustratifs — ce ne sont pas des simulations de vol.</p>
      </section>

      <section className="panel mt-4 p-5">
        <h2 className="label mb-4">Statut des fonctionnalités</h2>
        <div className="grid gap-x-8 gap-y-1 md:grid-cols-2">
          {MODULES.filter((m) => m.id !== "dashboard").map((m) => {
            const Icon = m.icon;
            return (
              <Link key={m.id} href={m.href} className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-surface-2">
                <Icon size={16} strokeWidth={1.75} className="text-muted" />
                <span className="flex-1 text-sm">{m.label}</span>
                <StatusTag status={m.status} phase={m.phase} />
              </Link>
            );
          })}
        </div>
      </section>
    </>
  );
}

function Stat({ label, value, sub, muted, small }: { label: string; value: string; sub: string; muted?: boolean; small?: boolean }) {
  return (
    <div className="panel min-w-0 p-4 sm:p-5">
      <div className="label truncate">{label}</div>
      <div className={`mt-3 truncate font-semibold tracking-tight ${small ? "text-lg" : "mono text-3xl"} ${muted ? "text-faint" : ""}`}>{value}</div>
      <div className="mt-1 truncate text-xs text-faint">{sub}</div>
    </div>
  );
}
