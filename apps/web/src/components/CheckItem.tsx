import { AlertTriangle, Ban, Info, UserCheck } from "lucide-react";
import type { CheckLevel } from "@dfs/flight-safety";

const LEVEL_META: Record<CheckLevel, { icon: typeof Info; cls: string; label: string }> = {
  info: { icon: Info, cls: "text-accent", label: "Information" },
  warning: { icon: AlertTriangle, cls: "text-warn", label: "Avertissement" },
  "technical-block": { icon: Ban, cls: "text-danger", label: "Blocage technique" },
  "human-validation": { icon: UserCheck, cls: "text-cyan", label: "Validation humaine" },
};

export function CheckItem({ level, title, detail }: { level: CheckLevel; title: string; detail: string }) {
  const m = LEVEL_META[level];
  const Icon = m.icon;
  return (
    <li className="flex gap-3">
      <Icon size={16} className={`mt-0.5 shrink-0 ${m.cls}`} aria-label={m.label} />
      <div>
        <div className="text-sm">{title}</div>
        <div className="text-xs leading-relaxed text-faint">{detail}</div>
      </div>
    </li>
  );
}
