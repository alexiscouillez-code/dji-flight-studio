"use client";
import { useEffect, useState } from "react";

const KEY = "dfs.sunTime";

/** Date/time used for sun lighting, shared by the 3D workspaces. null = live "now". */
export function useSunTime(): [Date, Date | null, (d: Date | null) => void] {
  const [fixed, setFixed] = useState<Date | null>(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    try { const v = localStorage.getItem(KEY); if (v) { const d = new Date(v); if (!Number.isNaN(d.getTime())) setFixed(d); } } catch { /* ignore */ }
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);
  const set = (d: Date | null) => {
    setFixed(d);
    try { if (d) localStorage.setItem(KEY, d.toISOString()); else localStorage.removeItem(KEY); } catch { /* ignore */ }
  };
  return [fixed ?? now, fixed, set];
}
