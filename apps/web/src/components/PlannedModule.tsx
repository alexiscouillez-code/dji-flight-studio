import Link from "next/link";
import { ArrowLeft, Check, Clock } from "lucide-react";
import { getModule } from "@/lib/modules";
import { PageHeader } from "./PageHeader";
import { StatusTag } from "./StatusTag";

/** Honest placeholder for a module not yet built: says what exists and what is planned. */
export function PlannedModule({ id }: { id: string }) {
  const m = getModule(id);
  const Icon = m.icon;
  return (
    <>
      <PageHeader eyebrow={`Module · Phase ${m.phase}`} title={m.label} description={m.summary} actions={<StatusTag status={m.status} phase={m.phase} />} />
      <div className="panel relative overflow-hidden p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-10 -top-10 opacity-[0.06]"><Icon size={260} strokeWidth={1} /></div>
        <p className="max-w-2xl text-sm text-muted">
          Ce module n'est pas encore disponible dans l'interface. Rien ici n'est simulé ou factice : la liste ci-dessous
          indique précisément ce qui existe déjà dans le code et ce qui est prévu.
        </p>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div>
            <div className="label mb-3">Déjà en place</div>
            {m.available.length ? (
              <ul className="space-y-2 text-sm">{m.available.map((a) => <li key={a} className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-ok" />{a}</li>)}</ul>
            ) : <p className="text-sm text-faint">Rien pour l'instant.</p>}
          </div>
          <div>
            <div className="label mb-3">Prévu — Phase {m.phase}</div>
            <ul className="space-y-2 text-sm text-muted">{m.planned.map((a) => <li key={a} className="flex gap-2"><Clock size={16} className="mt-0.5 shrink-0 text-faint" />{a}</li>)}</ul>
          </div>
        </div>
        <Link href="/" className="btn mt-8"><ArrowLeft size={15} />Dashboard</Link>
      </div>
    </>
  );
}
