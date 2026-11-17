"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import type { Project } from "@dfs/shared-types";
import { getSupabase, isSupabaseConfigured } from "./supabase";
import { LocalProjectRepository, SupabaseProjectRepository, sortProjects, type ProjectRepository } from "./repository";

interface StudioState {
  supabaseConfigured: boolean;
  session: Session | null;
  authReady: boolean;
  repo: ProjectRepository | null;
  projects: Project[];
  loading: boolean;
  error: string | null;
  warnings: string[];
  refresh(): Promise<void>;
  save(p: Project): Promise<void>;
  remove(id: string): Promise<void>;
  signOut(): Promise<void>;
}

const Ctx = createContext<StudioState | null>(null);

export function StudioProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true); });
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const repo = useMemo<ProjectRepository | null>(() => {
    if (!authReady) return null;
    const sb = getSupabase();
    if (sb && session) return new SupabaseProjectRepository(sb, session.user.id);
    return new LocalProjectRepository();
  }, [authReady, session]);

  const refresh = useCallback(async () => {
    if (!repo) return;
    setLoading(true);
    try {
      const r = await repo.list();
      setProjects(r.projects);
      setWarnings(r.warnings);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [repo]);

  useEffect(() => { void refresh(); }, [refresh]);

  const save = useCallback(async (p: Project) => {
    if (!repo) throw new Error("Stockage non initialisé.");
    await repo.save(p);
    setProjects((ps) => sortProjects([...ps.filter((x) => x.id !== p.id), p]));
  }, [repo]);

  const remove = useCallback(async (id: string) => {
    if (!repo) throw new Error("Stockage non initialisé.");
    await repo.remove(id);
    setProjects((ps) => ps.filter((x) => x.id !== id));
  }, [repo]);

  const signOut = useCallback(async () => { await getSupabase()?.auth.signOut(); }, []);

  const value: StudioState = {
    supabaseConfigured: isSupabaseConfigured, session, authReady, repo, projects, loading, error, warnings,
    refresh, save, remove, signOut,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStudio() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStudio must be used inside <StudioProvider>");
  return v;
}

export const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
