"use client";
import type * as CesiumNS from "cesium";

export type Cesium = typeof CesiumNS;

declare global {
  interface Window { Cesium?: Cesium; CESIUM_BASE_URL?: string }
}

let loading: Promise<Cesium> | null = null;

/** Loads the static Cesium build from /cesium once (script + widgets CSS). */
export function loadCesium(): Promise<Cesium> {
  if (window.Cesium) return Promise.resolve(window.Cesium);
  if (loading) return loading;
  window.CESIUM_BASE_URL = "/cesium/";
  loading = new Promise<Cesium>((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "/cesium/Widgets/widgets.css";
    document.head.appendChild(css);
    const s = document.createElement("script");
    s.src = "/cesium/Cesium.js";
    s.async = true;
    s.onload = () => (window.Cesium ? resolve(window.Cesium) : reject(new Error("Cesium introuvable après chargement.")));
    s.onerror = () => { loading = null; reject(new Error("Impossible de charger CesiumJS (réseau ?).")); };
    document.head.appendChild(s);
  });
  return loading;
}

export const CESIUM_ION_TOKEN = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN ?? "";
export const hasIonToken = CESIUM_ION_TOKEN.length > 20;
