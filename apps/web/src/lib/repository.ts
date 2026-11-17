"use client";
import { migrateProject, type Project } from "@dfs/shared-types";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ProjectRepository {
  readonly kind: "local" | "cloud";
  list(): Promise<{ projects: Project[]; warnings: string[] }>;
  save(p: Project): Promise<void>;
  remove(id: string): Promise<void>;
}

const LS_KEY = "dfs.projects.v1";

/** Guest mode: projects live in this browser only. */
export class LocalProjectRepository implements ProjectRepository {
  readonly kind = "local" as const;
  private read(): unknown[] {
    try {
      const raw = localStorage.getItem(LS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }
  private write(list: Project[]) {
    localStorage.setItem(LS_KEY, JSON.stringify(list));
  }
  async list() {
    const warnings: string[] = [];
    const projects: Project[] = [];
    for (const item of this.read()) {
      try { projects.push(migrateProject(item)); }
      catch (e) { warnings.push(`Projet local ignoré (illisible) : ${(e as Error).message}`); }
    }
    return { projects: sortProjects(projects), warnings };
  }
  async save(p: Project) {
    const { projects } = await this.list();
    const i = projects.findIndex((x) => x.id === p.id);
    if (i >= 0) projects[i] = p; else projects.push(p);
    try { this.write(projects); }
    catch { throw new Error("Stockage local plein ou indisponible."); }
  }
  async remove(id: string) {
    const { projects } = await this.list();
    this.write(projects.filter((p) => p.id !== id));
  }
}

interface ProjectRow {
  id: string; data: unknown; updated_at: string;
}

/** Signed-in mode: Supabase `projects` table, protected by RLS (owner_id = auth.uid()). */
export class SupabaseProjectRepository implements ProjectRepository {
  readonly kind = "cloud" as const;
  constructor(private sb: SupabaseClient, private userId: string) {}
  async list() {
    const { data, error } = await this.sb
      .from("projects").select("id, data, updated_at").order("updated_at", { ascending: false }).limit(500);
    if (error) throw new Error(`Supabase : ${error.message}`);
    const warnings: string[] = [];
    const projects: Project[] = [];
    for (const row of (data ?? []) as ProjectRow[]) {
      try { projects.push(migrateProject(row.data)); }
      catch (e) { warnings.push(`Projet ${row.id} illisible : ${(e as Error).message}`); }
    }
    return { projects: sortProjects(projects), warnings };
  }
  async save(p: Project) {
    const { error } = await this.sb.from("projects").upsert({
      id: p.id,
      owner_id: this.userId,
      name: p.name,
      description: p.description,
      archived: p.archived,
      schema_version: p.schemaVersion,
      drone_profile_id: p.droneProfileId,
      data: p,
      created_at: p.createdAt,
      updated_at: p.updatedAt,
    });
    if (error) throw new Error(`Supabase : ${error.message}`);
  }
  async remove(id: string) {
    const { error } = await this.sb.from("projects").delete().eq("id", id);
    if (error) throw new Error(`Supabase : ${error.message}`);
  }
}

export const sortProjects = (ps: Project[]) => [...ps].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
