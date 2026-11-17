"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { evaluateMission, LEVEL_ORDER, SAFETY_DISCLAIMER } from "@dfs/flight-safety";
import { PageHeader } from "@/components/PageHeader";
import { CheckItem } from "@/components/CheckItem";
import { useStudio } from "@/lib/store";

const PRINCIPLES = [
  "Priorité absolue au pilote", "Pas de décollage automatique", "Pas de désactivation des protections natives",
  "Pas de contournement des restrictions", "Pas d'automatisation non autorisée", "Interruption toujours possible", "Contrôle humain permanent",
];

export default function FlightSafety() {
  const { projects } = useStudio();
  const active = projects.filter((p) => !p.archived);
  const [id, setId] = useState<string>("");
  const project = active.find((p) => p.id === id) ?? active[0];
  const checks = useMemo(() => (project ? evaluateMission(project).sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]) : []), [project]);

  return (
    <>
      <PageHeader eyebrow="Flight Safety" title="Vérifications pré-vol" description={SAFETY_DISCLAIMER} />
      <div className="grid gap-4 xl:grid-cols-3">
        <section className="panel p-5 xl:col-span-2">
          {active.length === 0 ? (
            <p className="text-sm text-muted">Aucun projet à évaluer. <Link href="/projects" className="text-cyan hover:underline">Créer un projet</Link>.</p>
          ) : (<>
            <label className="label mb-2 block" htmlFor="ps">Projet évalué</label>
            <select id="ps" className="input mb-5" value={project?.id} onChange={(e) => setId(e.target.value)}>
              {active.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <ul className="space-y-4">{checks.map((c) => <CheckItem key={c.id} level={c.level} title={c.title} detail={c.detail} />)}</ul>
          </>)}
        </section>
        <section className="panel p-5">
          <div className="label mb-3">Principes</div>
          <ul className="space-y-2 text-sm">{PRINCIPLES.map((p) => <li key={p} className="flex gap-2"><span className="text-cyan">—</span>{p}</li>)}</ul>
          <div className="label mb-2 mt-6">Niveaux</div>
          <ul className="space-y-3">
            <CheckItem level="info" title="Information" detail="Contexte utile, aucune action requise." />
            <CheckItem level="warning" title="Avertissement" detail="Point de vigilance à examiner." />
            <CheckItem level="technical-block" title="Blocage technique" detail="Le plan ne peut pas être préparé en l'état." />
            <CheckItem level="human-validation" title="Validation humaine" detail="Seul le pilote peut le vérifier." />
          </ul>
        </section>
      </div>
    </>
  );
}
