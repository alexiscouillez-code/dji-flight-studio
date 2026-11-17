import type { ModuleStatus } from "@/lib/modules";

export function StatusTag({ status, phase }: { status: ModuleStatus; phase: number }) {
  if (status === "ready") return <span className="tag tag-ok">Opérationnel</span>;
  if (status === "partial") return <span className="tag tag-accent">Partiel</span>;
  return <span className="tag">Phase {phase}</span>;
}
