export type Quality = "low" | "medium" | "high" | "ultra";

export const QUALITY_LEVELS: Record<Quality, { label: string; maximumScreenSpaceError: number; resolutionScale: number; tileCacheSize: number; fog: boolean }> = {
  low: { label: "Low", maximumScreenSpaceError: 6, resolutionScale: 0.6, tileCacheSize: 60, fog: true },
  medium: { label: "Medium", maximumScreenSpaceError: 3, resolutionScale: 0.85, tileCacheSize: 120, fog: true },
  high: { label: "High", maximumScreenSpaceError: 2, resolutionScale: 1, tileCacheSize: 200, fog: true },
  ultra: { label: "Ultra", maximumScreenSpaceError: 1.33, resolutionScale: Math.min(1.5, typeof window !== "undefined" ? window.devicePixelRatio : 1), tileCacheSize: 400, fog: false },
};

const KEY = "dfs.quality";

/** Heuristic default from the device (cores + memory + screen); the user can override. */
export function detectQuality(): Quality {
  if (typeof navigator === "undefined") return "medium";
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const mobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
  if (mobile) return mem >= 6 ? "medium" : "low";
  if (cores >= 8 && mem >= 8) return "high";
  return "medium";
}

export function getQuality(): { value: Quality; auto: boolean } {
  try {
    const v = localStorage.getItem(KEY) as Quality | null;
    if (v && v in QUALITY_LEVELS) return { value: v, auto: false };
  } catch { /* storage unavailable */ }
  return { value: detectQuality(), auto: true };
}

export function setQuality(q: Quality | null) {
  try { if (q) localStorage.setItem(KEY, q); else localStorage.removeItem(KEY); } catch { /* ignore */ }
}
