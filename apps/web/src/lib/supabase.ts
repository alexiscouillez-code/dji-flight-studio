"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** True only when both public env vars are set. The service_role key is never used client-side. */
export const isSupabaseConfigured = Boolean(url && anon);

let client: SupabaseClient | null = null;
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!client) client = createClient(url!, anon!, { auth: { persistSession: true, autoRefreshToken: true } });
  return client;
}
