"use client";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface SavedLocation { id: string; name: string; lat: number; lon: number; createdAt: string }

const LS = "dfs.locations.v1";

/** Favorites: Supabase `saved_locations` when signed in, browser storage otherwise. */
export function createLocationsStore(sb: SupabaseClient | null, userId: string | null) {
  if (sb && userId) {
    return {
      kind: "cloud" as const,
      async list(): Promise<SavedLocation[]> {
        const { data, error } = await sb.from("saved_locations").select("id, name, lat, lon, created_at").order("created_at", { ascending: false }).limit(200);
        if (error) throw new Error(`Supabase : ${error.message}`);
        return (data ?? []).map((r) => ({ id: r.id, name: r.name, lat: r.lat, lon: r.lon, createdAt: r.created_at }));
      },
      async add(l: Omit<SavedLocation, "id" | "createdAt">) {
        const { error } = await sb.from("saved_locations").insert({ owner_id: userId, name: l.name.slice(0, 200), lat: l.lat, lon: l.lon });
        if (error) throw new Error(`Supabase : ${error.message}`);
      },
      async remove(id: string) {
        const { error } = await sb.from("saved_locations").delete().eq("id", id);
        if (error) throw new Error(`Supabase : ${error.message}`);
      },
    };
  }
  const read = (): SavedLocation[] => { try { const v = JSON.parse(localStorage.getItem(LS) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
  const write = (v: SavedLocation[]) => localStorage.setItem(LS, JSON.stringify(v));
  return {
    kind: "local" as const,
    async list() { return read(); },
    async add(l: Omit<SavedLocation, "id" | "createdAt">) { write([{ ...l, name: l.name.slice(0, 200), id: crypto.randomUUID(), createdAt: new Date().toISOString() }, ...read()].slice(0, 200)); },
    async remove(id: string) { write(read().filter((x) => x.id !== id)); },
  };
}
