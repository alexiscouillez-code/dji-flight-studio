import { CheckCircle2, ExternalLink, MinusCircle } from "lucide-react";
import { CAPABILITY_LABELS, DRONE_PROFILES, type Capability } from "@dfs/drone-adapters";
import { PageHeader } from "@/components/PageHeader";

export const metadata = { title: "Drone Connection" };

export default function DroneConnection() {
  return (
    <>
      <PageHeader eyebrow="Universal Drone Adapter" title="Drone Connection"
        description="Chaque drone a une fiche de compatibilité sourcée. Une fonction n'est exposée que si le matériel et un SDK officiel la prennent réellement en charge." />
      {Object.values(DRONE_PROFILES).map((p) => (
        <div key={p.id} className="grid gap-4 xl:grid-cols-3">
          <section className="panel p-5 xl:col-span-2">
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-semibold">{p.name}</h2>
              <span className="tag tag-accent">{p.mode === "manual-companion" ? "Companion manuel" : "Adaptateur SDK"}</span>
              <span className="tag">Aucune connexion</span>
            </div>
            <div className="label mb-3">Capacités</div>
            <ul className="divide-y divide-line">
              {(Object.keys(p.capabilities) as Capability[]).map((c) => {
                const s = p.capabilities[c];
                return (
                  <li key={c} className="flex gap-3 py-3">
                    {s.status === "supported" ? <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-ok" /> : <MinusCircle size={17} className="mt-0.5 shrink-0 text-faint" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-sm">{CAPABILITY_LABELS[c]}
                        <span className={`tag ${s.status === "supported" ? "tag-ok" : ""}`}>{s.status === "supported" ? "Supporté" : s.status === "not-supported" ? "Not Supported" : "Non vérifié"}</span>
                      </div>
                      <div className="mt-1 text-xs text-faint">{s.status === "supported" ? s.via : s.reason}</div>
                      {s.status === "not-supported" && s.manualWorkflow && <div className="mt-1 text-xs text-muted">→ Workflow manuel : {s.manualWorkflow}</div>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
          <div className="space-y-4">
            <section className="panel p-5">
              <div className="label mb-3">Fiche</div>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-muted">Vérifiée le</dt><dd className="mono">{p.verifiedOn}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted">Firmware contrôlé</dt><dd>{p.firmwareChecked ?? "—"}</dd></div>
                <div><dt className="text-muted">Radiocommandes (DJI Fly)</dt><dd className="mt-1 text-xs text-faint">{p.controllers.join(" · ")}</dd></div>
              </dl>
              {p.knownLimits.map((l) => (
                <div key={l.label} className="mt-4 rounded-lg border border-line bg-surface-2/60 p-3 text-xs">
                  <div className="text-muted">{l.label}</div>
                  <div className="mono mt-1 text-lg text-text">{l.valueM} m</div>
                  <div className="text-faint">{l.context}</div>
                </div>
              ))}
            </section>
            <section className="panel p-5">
              <div className="label mb-3">Notes</div>
              <ul className="space-y-2 text-xs text-muted">{p.notes.map((n) => <li key={n}>• {n}</li>)}</ul>
              <div className="label mb-2 mt-5">Sources</div>
              <ul className="space-y-1.5 text-xs">{p.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-cyan hover:underline">{s.title}<ExternalLink size={11} /></a></li>)}</ul>
            </section>
          </div>
        </div>
      ))}
    </>
  );
}
