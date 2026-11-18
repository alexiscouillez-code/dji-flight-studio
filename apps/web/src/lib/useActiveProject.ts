"use client";
import { useEffect, useMemo, useState } from "react";
import { useStudio } from "./store";

const KEY = "dfs.vw.project";

/** Project shared by the 3D workspaces (Virtual World, Flight Designer, Timeline…), remembered per browser. */
export function useActiveProject() {
  const { projects, loading } = useStudio();
  const active = useMemo(() => projects.filter((p) => !p.archived), [projects]);
  const [projectId, setProjectId] = useState("");
  useEffect(() => {
    if (loading || (projectId && active.some((p) => p.id === projectId))) return;
    let last: string | null = null;
    try { last = localStorage.getItem(KEY); } catch { /* ignore */ }
    const pick = active.find((p) => p.id === last) ?? active[0];
    if (pick) setProjectId(pick.id);
  }, [loading, active, projectId]);
  useEffect(() => { if (projectId) try { localStorage.setItem(KEY, projectId); } catch { /* ignore */ } }, [projectId]);
  return { active, project: active.find((p) => p.id === projectId) ?? null, projectId, setProjectId, loading };
}
