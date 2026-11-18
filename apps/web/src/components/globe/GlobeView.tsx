"use client";
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import type { CameraView, LatLon, ProjectTrack } from "@dfs/shared-types";
import { CESIUM_ION_TOKEN, hasIonToken, loadCesium, type Cesium } from "@/lib/cesium";
import { QUALITY_LEVELS, type Quality } from "@/lib/quality";

export type ImageryMode = "satellite" | "map";
export type PickMode = "takeoff" | "subject" | null;

export interface GlobeStatus {
  terrain: "world-terrain" | "ellipsoid";
  /** Google Photorealistic 3D Tiles loaded (real mesh: relief, buildings, vegetation). */
  photoreal: boolean;
  imagery: "ion-aerial" | "osm";
  /** Human-readable reasons when something fell back. */
  notes: string[];
}

export interface CursorInfo { lat: number; lon: number; renderedTerrainM: number | null }

export interface GlobeHandle {
  flyTo(target: { lat: number; lon: number; heightM?: number; bbox?: [number, number, number, number] | null }): void;
  flyToTrack(track: ProjectTrack): void;
  flyToView(view: CameraView): void;
  getView(): CameraView | null;
  /** Most-detailed terrain heights (m, MSL-ish per provider) — null when only the ellipsoid is available. */
  sampleTerrain(points: LatLon[]): Promise<(number | null)[]>;
  terrainAvailable(): boolean;
  /** Raw Cesium access for workspaces that draw their own entities. */
  raw(): { viewer: import("cesium").Viewer; Cs: Cesium } | null;
}

interface Props {
  ref?: Ref<GlobeHandle>;
  quality: Quality;
  imagery: ImageryMode;
  terrain: boolean;
  showTracks: boolean;
  showMarkers: boolean;
  tracks: ProjectTrack[];
  takeoff?: LatLon;
  subject?: LatLon;
  searchPin?: (LatLon & { label: string }) | null;
  pickMode: PickMode;
  initialView?: CameraView;
  /** Show the photorealistic 3D mesh when available (default true). */
  photoreal?: boolean;
  /** Date/time used for sun lighting and shadows (default: now). */
  sunDate?: Date;
  onPick?(mode: Exclude<PickMode, null>, p: LatLon): void;
  onCursor?(c: CursorInfo | null): void;
  onStatus?(s: GlobeStatus): void;
}

const CYAN = "#2ad4ee";
export { CYAN as GLOBE_ACCENT };

export function GlobeView(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const C = useRef<Cesium | null>(null);
  const viewerRef = useRef<import("cesium").Viewer | null>(null);
  const terrainOk = useRef(false);
  const worldTerrain = useRef<import("cesium").TerrainProvider | null>(null);
  const tileset = useRef<import("cesium").Cesium3DTileset | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<GlobeStatus | null>(null);

  // ---- init ----
  useEffect(() => {
    let destroyed = false;
    let handler: import("cesium").ScreenSpaceEventHandler | null = null;
    (async () => {
      try {
        const Cs = await loadCesium();
        if (destroyed || !host.current) return;
        C.current = Cs;
        if (hasIonToken) Cs.Ion.defaultAccessToken = CESIUM_ION_TOKEN;
        const viewer = new Cs.Viewer(host.current, {
          baseLayer: false,
          terrainProvider: new Cs.EllipsoidTerrainProvider(),
          animation: false, timeline: false, baseLayerPicker: false, geocoder: false, homeButton: false,
          sceneModePicker: false, navigationHelpButton: false, infoBox: false, selectionIndicator: false,
          fullscreenButton: false, requestRenderMode: true, maximumRenderTimeChange: Infinity,
        });
        viewerRef.current = viewer;
        viewer.scene.globe.depthTestAgainstTerrain = true;
        // Real conditions: sun lighting from the chosen date/time, sky & ground atmosphere, fog.
        viewer.scene.globe.enableLighting = true;
        viewer.scene.globe.dynamicAtmosphereLighting = true;
        viewer.scene.globe.showGroundAtmosphere = true;
        if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = true;
        viewer.scene.fog.enabled = true;
        viewer.clock.shouldAnimate = false;
        viewer.clock.currentTime = Cs.JulianDate.fromDate(propsRef.current.sunDate ?? new Date());
        viewer.scene.backgroundColor = Cs.Color.fromCssColorString("#06090f");
        (viewer.cesiumWidget.creditContainer as HTMLElement).classList.add("dfs-credits");

        const notes: string[] = [];
        let terrainKind: GlobeStatus["terrain"] = "ellipsoid";
        if (hasIonToken) {
          try {
            worldTerrain.current = await Cs.CesiumTerrainProvider.fromIonAssetId(1, { requestVertexNormals: true });
            terrainKind = "world-terrain";
          } catch (e) {
            notes.push(`Relief indisponible (${(e as Error).message || "accès Cesium ion refusé"}) : globe lisse.`);
          }
          try {
            const ts = await Cs.createGooglePhotorealistic3DTileset({ onlyUsingWithGoogleGeocoder: true }, { maximumScreenSpaceError: 16, showCreditsOnScreen: true });
            if (destroyed) return;
            ts.show = false;
            viewer.scene.primitives.add(ts);
            tileset.current = ts;
          } catch (e) {
            notes.push(`3D photoréaliste indisponible (${(e as Error).message || "accès refusé"}) : relief + imagerie.`);
          }
        } else notes.push("Aucun token Cesium ion : relief et imagerie satellite désactivés.");
        if (destroyed) return;
        terrainOk.current = terrainKind === "world-terrain";
        const st: GlobeStatus = { terrain: terrainKind, photoreal: Boolean(tileset.current), imagery: hasIonToken ? "ion-aerial" : "osm", notes };
        setStatus(st);
        propsRef.current.onStatus?.(st);

        handler = new Cs.ScreenSpaceEventHandler(viewer.scene.canvas);
        const pickLatLon = (pos: import("cesium").Cartesian2): LatLon | null => {
          const ray = viewer.camera.getPickRay(pos);
          const onMesh = tileset.current?.show && viewer.scene.pickPositionSupported ? viewer.scene.pickPosition(pos) : undefined;
          const cart = onMesh ?? (ray && viewer.scene.globe.show ? viewer.scene.globe.pick(ray, viewer.scene) : undefined) ?? viewer.camera.pickEllipsoid(pos);
          if (!cart) return null;
          const c = Cs.Cartographic.fromCartesian(cart);
          return { lat: Cs.Math.toDegrees(c.latitude), lon: Cs.Math.toDegrees(c.longitude) };
        };
        let raf = 0;
        handler.setInputAction((m: { endPosition: import("cesium").Cartesian2 }) => {
          cancelAnimationFrame(raf);
          raf = requestAnimationFrame(() => {
            const p = pickLatLon(m.endPosition);
            if (!p) return propsRef.current.onCursor?.(null);
            const h = viewer.scene.globe.getHeight(Cs.Cartographic.fromDegrees(p.lon, p.lat));
            propsRef.current.onCursor?.({ ...p, renderedTerrainM: terrainOk.current && h !== undefined ? h : null });
          });
        }, Cs.ScreenSpaceEventType.MOUSE_MOVE);
        handler.setInputAction((c: { position: import("cesium").Cartesian2 }) => {
          const mode = propsRef.current.pickMode;
          if (!mode) return;
          const p = pickLatLon(c.position);
          if (p) propsRef.current.onPick?.(mode, p);
        }, Cs.ScreenSpaceEventType.LEFT_CLICK);

        const v = propsRef.current.initialView;
        if (v) {
          viewer.camera.setView({
            destination: Cs.Cartesian3.fromDegrees(v.lon, v.lat, v.heightM),
            orientation: { heading: Cs.Math.toRadians(v.headingDeg), pitch: Cs.Math.toRadians(v.pitchDeg), roll: 0 },
          });
        } else {
          // Start low and oblique over the Mont-Blanc massif rather than from space.
          viewer.camera.setView({
            destination: Cs.Cartesian3.fromDegrees(6.905, 45.80, 4200),
            orientation: { heading: Cs.Math.toRadians(320), pitch: Cs.Math.toRadians(-12), roll: 0 },
          });
        }
        setReady(true);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
    return () => {
      destroyed = true;
      handler?.destroy();
      viewerRef.current?.destroy();
      viewerRef.current = null;
    };
  }, []);

  const viewer = viewerRef.current;
  const Cs = C.current;

  // ---- quality ----
  useEffect(() => {
    if (!ready || !viewer) return;
    const q = QUALITY_LEVELS[props.quality];
    viewer.scene.globe.maximumScreenSpaceError = q.maximumScreenSpaceError;
    viewer.resolutionScale = q.resolutionScale;
    viewer.scene.globe.tileCacheSize = q.tileCacheSize;
    viewer.scene.fog.enabled = true;
    const shadows = props.quality === "high" || props.quality === "ultra";
    viewer.shadows = shadows;
    viewer.terrainShadows = shadows ? Cs!.ShadowMode.RECEIVE_ONLY : Cs!.ShadowMode.DISABLED;
    if (tileset.current) {
      tileset.current.maximumScreenSpaceError = q.maximumScreenSpaceError * 8;
      tileset.current.shadows = shadows ? Cs!.ShadowMode.ENABLED : Cs!.ShadowMode.DISABLED;
    }
    viewer.scene.requestRender();
  }, [ready, viewer, Cs, props.quality]);

  // ---- sun / time of day ----
  useEffect(() => {
    if (!ready || !viewer || !Cs) return;
    viewer.clock.currentTime = Cs.JulianDate.fromDate(props.sunDate ?? new Date());
    viewer.scene.requestRender();
  }, [ready, viewer, Cs, props.sunDate]);

  // ---- imagery ----
  useEffect(() => {
    if (!ready || !viewer || !Cs) return;
    let cancelled = false;
    (async () => {
      viewer.imageryLayers.removeAll();
      if (props.imagery === "satellite" && hasIonToken) {
        try {
          const prov = await Cs.IonImageryProvider.fromAssetId(2);
          if (cancelled) return;
          viewer.imageryLayers.addImageryProvider(prov);
        } catch {
          if (cancelled) return;
          viewer.imageryLayers.addImageryProvider(new Cs.OpenStreetMapImageryProvider({ url: "https://tile.openstreetmap.org/" }));
          setStatus((s) => {
            if (!s) return s;
            const n: GlobeStatus = { ...s, imagery: "osm", notes: [...new Set([...s.notes, "Imagerie satellite refusée par Cesium ion : carte OSM affichée."])] };
            propsRef.current.onStatus?.(n);
            return n;
          });
        }
      } else {
        viewer.imageryLayers.addImageryProvider(new Cs.OpenStreetMapImageryProvider({ url: "https://tile.openstreetmap.org/" }));
      }
      viewer.scene.requestRender();
    })();
    return () => { cancelled = true; };
  }, [ready, viewer, Cs, props.imagery]);

  // ---- terrain ----
  useEffect(() => {
    if (!ready || !viewer || !Cs) return;
    const useWorld = props.terrain && worldTerrain.current;
    viewer.terrainProvider = useWorld ? worldTerrain.current! : new Cs.EllipsoidTerrainProvider();
    terrainOk.current = Boolean(useWorld);
    // Photorealistic mesh replaces the globe surface (Google tiles must not be mixed with other basemaps).
    const photo = Boolean(tileset.current) && props.photoreal !== false;
    if (tileset.current) tileset.current.show = photo;
    viewer.scene.globe.show = !photo;
    viewer.scene.requestRender();
  }, [ready, viewer, Cs, props.terrain, props.photoreal]);

  // ---- entities (tracks, markers) ----
  useEffect(() => {
    if (!ready || !viewer || !Cs) return;
    viewer.entities.removeAll();
    if (props.showTracks) {
      for (const t of props.tracks) {
        if (!t.visible) continue;
        viewer.entities.add({
          name: t.name,
          polyline: {
            positions: Cs.Cartesian3.fromDegreesArray(t.points.flatMap((p) => [p.lon, p.lat])),
            clampToGround: true, width: 4,
            material: new Cs.PolylineOutlineMaterialProperty({ color: Cs.Color.fromCssColorString(CYAN), outlineColor: Cs.Color.fromCssColorString("#06090f"), outlineWidth: 1.5 }),
          },
        });
        const s = t.points[0]!, e = t.points[t.points.length - 1]!;
        addPin(viewer, Cs, s, "Départ", "#3ddc97");
        addPin(viewer, Cs, e, "Arrivée", "#ff5d6c");
      }
    }
    if (props.showMarkers) {
      if (props.takeoff) addPin(viewer, Cs, props.takeoff, "Décollage", "#2e9bff");
      if (props.subject) addPin(viewer, Cs, props.subject, "Sujet", "#f5b84a");
    }
    if (props.searchPin) addPin(viewer, Cs, props.searchPin, props.searchPin.label.split(",")[0]!.slice(0, 40), "#e9eef6");
    viewer.scene.requestRender();
  }, [ready, viewer, Cs, props.tracks, props.showTracks, props.showMarkers, props.takeoff, props.subject, props.searchPin]);

  // ---- cursor style for pick mode ----
  useEffect(() => {
    if (host.current) host.current.style.cursor = props.pickMode ? "crosshair" : "";
  }, [props.pickMode]);

  useImperativeHandle(props.ref, () => ({
    flyTo({ lat, lon, heightM, bbox }) {
      const v = viewerRef.current, X = C.current;
      if (!v || !X) return;
      if (bbox && bbox[2] - bbox[0] > 0.002) {
        v.camera.flyTo({ destination: X.Rectangle.fromDegrees(...bbox), duration: 2.2 });
      } else {
        v.camera.flyTo({
          destination: X.Cartesian3.fromDegrees(lon, lat - 0.035, heightM ?? 4500),
          orientation: { heading: 0, pitch: X.Math.toRadians(-35), roll: 0 },
          duration: 2.2,
        });
      }
    },
    flyToTrack(t) {
      const v = viewerRef.current, X = C.current;
      if (!v || !X) return;
      const lats = t.points.map((p) => p.lat), lons = t.points.map((p) => p.lon);
      const pad = 0.15;
      const w = Math.min(...lons), e = Math.max(...lons), s = Math.min(...lats), n = Math.max(...lats);
      const dl = (e - w) * pad + 0.002, dp = (n - s) * pad + 0.002;
      v.camera.flyTo({ destination: X.Rectangle.fromDegrees(w - dl, s - dp, e + dl, n + dp), duration: 2 });
    },
    flyToView(view) {
      const v = viewerRef.current, X = C.current;
      if (!v || !X) return;
      v.camera.flyTo({
        destination: X.Cartesian3.fromDegrees(view.lon, view.lat, view.heightM),
        orientation: { heading: X.Math.toRadians(view.headingDeg), pitch: X.Math.toRadians(view.pitchDeg), roll: 0 },
        duration: 2,
      });
    },
    getView() {
      const v = viewerRef.current, X = C.current;
      if (!v || !X) return null;
      const c = v.camera.positionCartographic;
      return {
        lat: X.Math.toDegrees(c.latitude), lon: X.Math.toDegrees(c.longitude), heightM: Math.max(1, c.height),
        headingDeg: X.Math.toDegrees(v.camera.heading), pitchDeg: Math.max(-90, Math.min(90, X.Math.toDegrees(v.camera.pitch))),
      };
    },
    async sampleTerrain(points) {
      const v = viewerRef.current, X = C.current;
      if (!v || !X || !terrainOk.current || !worldTerrain.current) return points.map(() => null);
      const carts = points.map((p) => X.Cartographic.fromDegrees(p.lon, p.lat));
      const res = await X.sampleTerrainMostDetailed(worldTerrain.current, carts);
      return res.map((c) => (Number.isFinite(c.height) ? c.height : null));
    },
    terrainAvailable: () => terrainOk.current,
    raw: () => (viewerRef.current && C.current ? { viewer: viewerRef.current, Cs: C.current } : null),
  }), []);

  return (
    <div className="absolute inset-0">
      <div ref={host} className="absolute inset-0" />
      {!ready && !error && (
        <div className="absolute inset-0 grid place-items-center text-sm text-muted">
          <div className="flex flex-col items-center gap-3"><span className="h-6 w-6 animate-spin rounded-full border-2 border-cyan border-t-transparent" />Chargement du globe…</div>
        </div>
      )}
      {error && <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-danger">{error}</div>}
      {status && status.notes.length > 0 && (
        <div className="pointer-events-none absolute right-3 top-3 max-w-xs space-y-1">
          {status.notes.map((n) => <div key={n} className="rounded-md border border-warn/30 bg-bg/80 px-2.5 py-1.5 text-[11px] text-warn backdrop-blur">{n}</div>)}
        </div>
      )}
    </div>
  );
}

function addPin(viewer: import("cesium").Viewer, Cs: Cesium, p: LatLon, label: string, color: string) {
  viewer.entities.add({
    position: Cs.Cartesian3.fromDegrees(p.lon, p.lat),
    point: {
      pixelSize: 11, color: Cs.Color.fromCssColorString(color), outlineColor: Cs.Color.fromCssColorString("#06090f"), outlineWidth: 2,
      heightReference: Cs.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: {
      text: label, font: "500 12px system-ui, sans-serif", fillColor: Cs.Color.fromCssColorString("#e9eef6"),
      showBackground: true, backgroundColor: Cs.Color.fromCssColorString("#06090fcc"), backgroundPadding: new Cs.Cartesian2(7, 4),
      pixelOffset: new Cs.Cartesian2(0, -22), heightReference: Cs.HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
}
