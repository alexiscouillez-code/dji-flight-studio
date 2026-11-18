"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Cloud, HardDrive, Menu, X } from "lucide-react";
import clsx from "clsx";
import { PRIMARY_NAV } from "@/lib/modules";
import { useStudio } from "@/lib/store";
import { Logo } from "./Logo";

/** Routes that use the full viewport (3D workspaces). */
const IMMERSIVE = new Set(["/virtual-world", "/flight-designer", "/timeline", "/camera-director", "/simulator"]);

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav aria-label="Navigation principale" className="flex flex-col gap-0.5">
      {PRIMARY_NAV.map((m, i) => {
        const active = m.href === "/" ? path === "/" : path.startsWith(m.href);
        const Icon = m.icon;
        return (
          <Link
            key={m.id}
            href={m.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] transition-colors",
              active ? "bg-surface-3 text-text" : "text-muted hover:bg-surface-2 hover:text-text",
            )}
          >
            {active && <span className="absolute left-0 top-2 bottom-2 w-[2px] rounded bg-cyan shadow-[0_0_10px_var(--color-cyan)]" />}
            <span className="mono w-4 text-[10px] text-faint">{String(i + 1).padStart(2, "0")}</span>
            <Icon size={16} strokeWidth={1.75} className={active ? "text-cyan" : ""} />
            <span className="flex-1">{m.label}</span>
            {m.status === "planned" && <span className="mono text-[10px] text-faint">P{m.phase}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

function StorageBadge() {
  const { session, repo } = useStudio();
  if (!repo) return <div className="text-xs text-faint">Initialisation…</div>;
  return repo.kind === "cloud" ? (
    <div className="flex items-center gap-2 text-xs text-muted"><Cloud size={14} className="text-ok" /><span className="truncate">{session?.user.email}</span></div>
  ) : (
    <Link href="/settings" className="flex items-center gap-2 text-xs text-muted hover:text-text"><HardDrive size={14} className="text-warn" />Stockage local (invité)</Link>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col border-r border-line bg-bg/60 px-3 py-4 backdrop-blur lg:flex">
        <Link href="/" className="mb-6 flex items-center gap-2.5 px-2">
          <Logo />
          <div className="leading-tight">
            <div className="text-[13px] font-semibold tracking-wide">DJI FLIGHT STUDIO</div>
            <div className="text-[10.5px] text-faint">Real World Cinematic Flight Planner</div>
          </div>
        </Link>
        <NavList />
        <div className="mt-auto border-t border-line px-2 pt-3"><StorageBadge /></div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-bg/80 px-4 backdrop-blur lg:hidden">
          <button className="btn h-9 w-9 justify-center p-0" aria-label="Ouvrir le menu" onClick={() => setOpen(true)}><Menu size={18} /></button>
          <Logo size={24} />
          <span className="text-[13px] font-semibold tracking-wide">DJI FLIGHT STUDIO</span>
        </header>

        {open && (
          <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
            <div className="absolute inset-y-0 left-0 flex w-[280px] flex-col border-r border-line bg-surface px-3 py-4">
              <div className="mb-5 flex items-center justify-between px-2">
                <div className="flex items-center gap-2"><Logo size={24} /><span className="text-[13px] font-semibold">DJI FLIGHT STUDIO</span></div>
                <button className="btn h-8 w-8 justify-center p-0" aria-label="Fermer" onClick={() => setOpen(false)}><X size={16} /></button>
              </div>
              <NavList onNavigate={() => setOpen(false)} />
              <div className="mt-auto border-t border-line px-2 pt-3"><StorageBadge /></div>
            </div>
          </div>
        )}

        {IMMERSIVE.has(path) ? <main className="relative flex-1">{children}</main>
          : <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">{children}</main>}
      </div>
    </div>
  );
}
