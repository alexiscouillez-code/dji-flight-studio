"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Camera, ChevronDown, ChevronUp, Crosshair, Eye, EyeOff, FileUp, Layers, LocateFixed, MapPin, Mountain, Search, Star, Trash2, X,
} from "lucide-react";
import type { LatLon, Project, ProjectTrack, ScenePoint } from "@dfs/shared-types";
import {
  computeGpxStats, createIonGeocoder, createNominatimGeocoder, formatLatLon, parseCoordinates, parseGpx,
  resampleByDistance, simplifyTrack, PROVIDERS, type GeocodeResult,
} from "@dfs/geographic-engine";
import { GlobeView, type CursorInfo, type GlobeHandle, type GlobeStatus, type ImageryMode, type PickMode } from "@/components/globe/GlobeView";
import { ElevationProfile, type ProfileSeries } from "@/components/globe/ElevationProfile";
import { CESIUM_ION_TOKEN, hasIonToken } from "@/lib/cesium";
import { createProject, withHistory } from "@/lib/projects";
import { getQuality, QUALITY_LEVELS, setQuality as persistQuality, type Quality } from "@/lib/quality";
import { createLocationsStore, type SavedLocation } from "@/lib/locations";
import { getSupabase } from "@/lib/supabase";
import { useStudio } from "@/lib/store";

const LAST_PROJECT = "dfs.vw.project";
const geocoder = hasIonToken ? createIonGeocoder(CESIUM_ION_TOKEN, (u, i) => fetch(u, i)) : createNominatimGeocoder((u, i) => fetch(u, i));
const MAX_GPX_BYTES = 15 * 1024 * 1024;

export function VirtualWorld() {
  const { projects, save, loading, repo, session } = useStudio();
  const globe = useRef<GlobeHandle>(null);
  const active = useMemo(() => projects.filter((p) => !p.archived), [projects]);
  const [projectId, setProjectId] = useState<string>("");
  const project = active.find((p) => p.id === projectId) ?? null;

  const [imagery, setImagery] = useState<ImageryMode>(hasIonToken ? "satellite" : "map");
  const [terrain, setTerrain] = useState(true);
  const [showTracks, setShowTracks] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const [quality, setQualityState] = useState<{ value: Quality; auto: boolean }>({ value: "medium", auto: true });
  const [status, setStatus] = useState<GlobeStatus | null>(null);
  const [cursor, setCursor] = useState<CursorInfo | null>(null);
  const [pickMode, setPickMode] = useState<PickMode>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [msg, setMsg] = useState<{ kind: "ok" | "err" | "warn"; text: string } | null>(null);

  useEffect(() => {
    setQualityState(getQuality());
    if (window.innerWidth < 1024) setPanelOpen(false); // mobile: globe first, sheet collapsed
  }, []);
  useEffect(() => { if (status?.imagery === "osm") setImagery("map"); }, [status?.imagery]);
  useEffect(() => {
    if (loading || projectId) return;
    let last: string | null = null;
    try { last = localStorage.getItem(LAST_PROJECT); } catch { /* ignore */ }
    const pick = active.find((p) => p.id === last) ?? active[0];
    if (pick) setProjectId(pick.id);
  }, [loading, active, projectId]);
  useEffect(() => { if (projectId) try { localStorage.setItem(LAST_PROJECT, projectId); } catch { /* ignore */ } }, [projectId]);

  const update = useCallback(async (mut: (p: Project) => Project, action: string) => {
    if (!project) return;
    try { await save(withHistory(mut(project), action)); }
    catch (e) { setMsg({ kind: "err", text: (e as Error).message }); }
  }, [project, save]);

  // ---------- search ----------
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [pin, setPin] = useState<(LatLon & { label: string }) | null>(null);
  const lastSearch = useRef(0);

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const coords = parseCoordinates(query);
    if (coords) {
      const r: GeocodeResult = { label: formatLatLon(coords), ...coords, bbox: null, source: "Coordonnées saisies" };
      setResults([r]); goTo(r); return;
    }
    if (!query.trim()) return;
    const wait = 1100 - (Date.now() - lastSearch.current); // Nominatim policy: ≤ 1 req/s
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastSearch.current = Date.now();
    setSearching(true);
    try {
      const r = await geocoder.search(query);
      setResults(r);
      if (!r.length) setMsg({ kind: "warn", text: "Aucun résultat." });
      else goTo(r[0]!);
    } catch (err) { setMsg({ kind: "err", text: (err as Error).message }); }
    finally { setSearching(false); }
  }
  function goTo(r: GeocodeResult) {
    setPin({ lat: r.lat, lon: r.lon, label: r.label });
    globe.current?.flyTo({ lat: r.lat, lon: r.lon, bbox: r.bbox });
  }

  // ---------- favorites ----------
  const sb = getSupabase();
  const locStore = useMemo(() => createLocationsStore(sb, session?.user.id ?? null), [sb, session]);
  const [favorites, setFavorites] = useState<SavedLocation[]>([]);
  const refreshFav = useCallback(() => locStore.list().then(setFavorites).catch((e) => setMsg({ kind: "err", text: e.message })), [locStore]);
  useEffect(() => { void refreshFav(); }, [refreshFav]);
  async function addFavorite(r: { label: string; lat: number; lon: number }) {
    try { await locStore.add({ name: r.label.split(",").slice(0, 2).join(",").trim() || formatLatLon(r), lat: r.lat, lon: r.lon }); await refreshFav(); setMsg({ kind: "ok", text: "Lieu ajouté aux favoris." }); }
    catch (e) { setMsg({ kind: "err", text: (e as Error).message }); }
  }

  // ---------- GPX ----------
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedTrack, setSelectedTrack] = useState<string | null>(null);
  const [dem, setDem] = useState<Record<string, ProfileSeries["points"]>>({});
  const [demBusy, setDemBusy] = useState(false);

  async function onGpx(file: File) {
    if (!project) return setMsg({ kind: "err", text: "Sélectionnez ou créez d'abord un projet." });
    if (file.size > MAX_GPX_BYTES) return setMsg({ kind: "err", text: "Fichier GPX trop volumineux (max 15 Mo)." });
    if (project.gpxTracks.length >= 10) return setMsg({ kind: "err", text: "Maximum 10 parcours par projet." });
    try {
      const parsed = parseGpx(await file.text());
      const stats = computeGpxStats(parsed.points);
      const pts = (parsed.points.length <= 5000 ? parsed.points : simplifyTrack(parsed.points, { maxPoints: 5000, toleranceM: 1 })).map(({ lat, lon, ele }) => ({ lat, lon, ele }));
      const track: ProjectTrack = {
        id: crypto.randomUUID(), name: (parsed.name || file.name.replace(/\.gpx$/i, "")).slice(0, 200), sourceFile: file.name.slice(0, 260),
        importedAt: new Date().toISOString(), points: pts, originalPointCount: stats.pointCount, distanceM: stats.distanceM,
        ascentM: stats.ascentM, descentM: stats.descentM, visible: true,
      };
      await update((p) => ({ ...p, gpxTracks: [...p.gpxTracks, track] }), `GPX importé : ${track.name}`);
      setSelectedTrack(track.id);
      globe.current?.flyToTrack(track);
      setMsg({ kind: parsed.warnings.length ? "warn" : "ok", text: [`« ${track.name} » importé (${stats.pointCount} points, ${pts.length} conservés pour l'affichage).`, ...parsed.warnings].join(" ") });
    } catch (e) { setMsg({ kind: "err", text: (e as Error).message }); }
    finally { if (fileRef.current) fileRef.current.value = ""; }
  }

  const track = project?.gpxTracks.find((t) => t.id === selectedTrack) ?? project?.gpxTracks[0] ?? null;
  const gpxProfile = useMemo(() => (track ? computeGpxStats(track.points.map((p) => ({ ...p, time: null }))).profile : []), [track]);

  async function compareDem() {
    if (!track) return;
    setDemBusy(true);
    try {
      const samples = resampleByDistance(track.points, 200);
      const h = await globe.current!.sampleTerrain(samples);
      const pts = samples.flatMap((s, i) => (h[i] === null ? [] : [{ distanceM: s.distanceM, ele: h[i]! }]));
      if (!pts.length) throw new Error("Relief indisponible : impossible d'échantillonner le terrain.");
      setDem((d) => ({ ...d, [track.id]: pts }));
    } catch (e) { setMsg({ kind: "err", text: (e as Error).message }); }
    finally { setDemBusy(false); }
  }

  // ---------- placement ----------
  async function onPick(mode: "takeoff" | "subject", p: LatLon) {
    setPickMode(null);
    let point: ScenePoint = { position: p };
    try {
      const [h] = await globe.current!.sampleTerrain([p]);
      if (h !== null && h !== undefined) point = { position: p, terrain: { valueM: h, reference: "terrain_msl", source: PROVIDERS["ion-world-terrain"]!.label } };
    } catch { /* keep without terrain */ }
    await update((pr) => ({ ...pr, scene: { ...pr.scene, [mode]: point } }), mode === "takeoff" ? "Point de décollage placé" : "Sujet placé");
  }

  async function saveView() {
    const v = globe.current?.getView();
    if (!v || !project) return;
    await update((p) => ({
      ...p,
      scene: { ...p.scene, view: v },
      environment: p.environment.kind === "real" ? p.environment : { kind: "real", center: { lat: v.lat, lon: v.lon }, ...(pin ? { label: pin.label.split(",")[0] } : {}) },
    }), "Vue 3D enregistrée");
    setMsg({ kind: "ok", text: "Vue enregistrée dans le projet." });
  }

  async function setEnvironmentFromPin() {
    if (!pin) return;
    await update((p) => ({ ...p, environment: { kind: "real", center: { lat: pin.lat, lon: pin.lon }, label: pin.label.split(",")[0]!.slice(0, 200) } }), "Environnement défini depuis la recherche");
    setMsg({ kind: "ok", text: "Environnement du projet mis à jour." });
  }

  async function newProject() {
    const p = createProject(pin ? pin.label.split(",")[0]! : "Nouveau projet");
    await save(pin ? { ...p, environment: { kind: "real", center: { lat: pin.lat, lon: pin.lon }, label: pin.label.split(",")[0]! } } : p);
    setProjectId(p.id);
  }

  // Fly to the project's saved view / environment when it changes.
  const flownFor = useRef<string | null>(null);
  useEffect(() => {
    if (!project || !status || flownFor.current === project.id) return;
    flownFor.current = project.id;
    const v = project.scene.view;
    if (v) globe.current?.flyToView(v);
    else if (project.gpxTracks[0]) globe.current?.flyToTrack(project.gpxTracks[0]);
    else if (project.environment.kind === "real") globe.current?.flyTo(project.environment.center);
  }, [project, status]);

  useEffect(() => { if (msg && msg.kind !== "err") { const t = setTimeout(() => setMsg(null), 5000); return () => clearTimeout(t); } }, [msg]);

  const terrainAvailable = status?.terrain === "world-terrain";

  return (
    <div className="relative h-[calc(100dvh-3.5rem)] w-full overflow-hidden lg:h-dvh">
      <GlobeView
        ref={globe} quality={quality.value} imagery={imagery} terrain={terrain} showTracks={showTracks} showMarkers={showMarkers}
        tracks={project?.gpxTracks ?? []} takeoff={project?.scene.takeoff?.position} subject={project?.scene.subject?.position}
        searchPin={pin} pickMode={pickMode} initialView={project?.scene.view}
        onPick={onPick} onCursor={setCursor} onStatus={setStatus}
      />

      {/* HUD */}
      <div className="pointer-events-none absolute bottom-3 left-3 z-10 hidden rounded-lg border border-line bg-bg/75 px-3 py-2 text-[11px] backdrop-blur sm:block">
        {cursor ? (
          <div className="mono space-y-0.5">
            <div>{formatLatLon(cursor, 5)}</div>
            <div className="text-faint">{cursor.renderedTerrainM !== null ? <>Terrain ≈ {Math.round(cursor.renderedTerrainM)} m <span className="text-[10px]">(tuile affichée, {PROVIDERS["ion-world-terrain"]!.label})</span></> : "Altitude terrain indisponible"}</div>
          </div>
        ) : <span className="text-faint">Survolez le globe</span>}
      </div>
      {pickMode && (
        <div className="absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full border border-cyan/40 bg-bg/90 px-4 py-2 text-sm backdrop-blur">
          <Crosshair size={15} className="text-cyan" />Touchez le globe pour placer {pickMode === "takeoff" ? "le décollage" : "le sujet"}
          <button className="text-muted hover:text-text" onClick={() => setPickMode(null)} aria-label="Annuler"><X size={15} /></button>
        </div>
      )}
      {msg && (
        <div role="status" className={`absolute left-1/2 top-14 z-20 w-[min(92%,520px)] -translate-x-1/2 rounded-lg border bg-bg/90 px-3 py-2 text-sm backdrop-blur ${msg.kind === "ok" ? "border-ok/40 text-ok" : msg.kind === "warn" ? "border-warn/40 text-warn" : "border-danger/40 text-danger"}`}>
          <div className="flex gap-2"><span className="flex-1">{msg.text}</span><button onClick={() => setMsg(null)} aria-label="Fermer"><X size={14} /></button></div>
        </div>
      )}

      {/* Panel: right column on desktop, bottom sheet on mobile */}
      <aside className={`absolute z-10 flex flex-col border-line bg-surface/92 backdrop-blur-md
        inset-x-0 bottom-0 max-h-[55dvh] rounded-t-2xl border-t
        lg:inset-x-auto lg:bottom-3 lg:left-3 lg:top-3 lg:max-h-none lg:w-[360px] lg:rounded-2xl lg:border ${panelOpen ? "" : "max-lg:max-h-14"}`}>
        <button className="flex items-center justify-between px-4 py-3 lg:cursor-default" onClick={() => setPanelOpen((o) => !o)} aria-expanded={panelOpen}>
          <span className="label">Virtual World</span>
          <span className="flex items-center gap-2 text-xs text-faint lg:hidden">{panelOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}</span>
        </button>
        <div className={`min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-4 ${panelOpen ? "" : "max-lg:hidden"}`}>
          {/* Project */}
          <section>
            <label className="mb-1.5 block text-xs text-muted" htmlFor="vw-project">Projet</label>
            {active.length ? (
              <div className="flex gap-2">
                <select id="vw-project" className="input h-9" value={projectId} onChange={(e) => { flownFor.current = null; setProjectId(e.target.value); }}>
                  {active.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                {project && <Link className="btn h-9 px-2.5" href={`/projects/${project.id}`} title="Ouvrir le projet" aria-label="Ouvrir le projet"><Eye size={15} /></Link>}
              </div>
            ) : (
              <button className="btn btn-primary w-full justify-center" onClick={newProject} disabled={!repo}>Créer un projet</button>
            )}
            <div className="mt-1.5 text-[11px] text-faint">{repo?.kind === "cloud" ? "Enregistré dans votre compte." : "Mode invité : enregistré dans ce navigateur."}</div>
          </section>

          {/* Search */}
          <section>
            <form onSubmit={onSearch} className="flex gap-2">
              <label className="sr-only" htmlFor="vw-search">Rechercher un lieu ou des coordonnées</label>
              <input id="vw-search" className="input h-9" placeholder="Mont Blanc, Chamonix, 45.83, 6.86…" value={query} onChange={(e) => setQuery(e.target.value)} />
              <button className="btn h-9 px-3" disabled={searching} aria-label="Rechercher"><Search size={15} /></button>
            </form>
            <div className="mt-1 text-[10.5px] text-faint">Géocodage : {geocoder.info.label}</div>
            {results.length > 0 && (
              <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
                {results.slice(0, 5).map((r, i) => (
                  <li key={i} className="flex items-center gap-2 px-2.5 py-2">
                    <button className="min-w-0 flex-1 text-left" onClick={() => goTo(r)}>
                      <div className="truncate text-xs">{r.label}</div>
                      <div className="mono text-[10px] text-faint">{formatLatLon(r, 4)}</div>
                    </button>
                    <button className="text-faint hover:text-warn" onClick={() => addFavorite(r)} title="Ajouter aux favoris" aria-label="Ajouter aux favoris"><Star size={14} /></button>
                  </li>
                ))}
              </ul>
            )}
            {pin && project && (
              <button className="btn mt-2 h-8 w-full justify-center text-xs" onClick={setEnvironmentFromPin}><MapPin size={13} />Définir comme lieu du projet</button>
            )}
          </section>

          {/* Favorites */}
          {favorites.length > 0 && (
            <section>
              <div className="label mb-2">Lieux favoris <span className="normal-case tracking-normal text-faint">· {locStore.kind === "cloud" ? "compte" : "navigateur"}</span></div>
              <ul className="space-y-1">
                {favorites.slice(0, 8).map((f) => (
                  <li key={f.id} className="flex items-center gap-2 text-xs">
                    <button className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-1 text-left hover:bg-surface-2" onClick={() => goTo({ ...f, label: f.name, bbox: null, source: "favori" })}>
                      <Star size={12} className="shrink-0 text-warn" /><span className="truncate">{f.name}</span>
                    </button>
                    <button className="text-faint hover:text-danger" onClick={() => locStore.remove(f.id).then(refreshFav)} aria-label={`Supprimer ${f.name}`}><X size={13} /></button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* GPX */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <div className="label">Parcours GPX</div>
              <input ref={fileRef} type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" className="hidden" onChange={(e) => e.target.files?.[0] && onGpx(e.target.files[0])} />
              <button className="btn h-8 text-xs" onClick={() => fileRef.current?.click()} disabled={!project}><FileUp size={14} />Importer</button>
            </div>
            {!project?.gpxTracks.length ? <p className="text-xs text-faint">Aucun parcours. Importez un fichier .gpx (trace ou itinéraire).</p> : (
              <ul className="space-y-1">
                {project.gpxTracks.map((t) => (
                  <li key={t.id} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs ${track?.id === t.id ? "bg-surface-3" : ""}`}>
                    <button className="min-w-0 flex-1 text-left" onClick={() => { setSelectedTrack(t.id); globe.current?.flyToTrack(t); }}>
                      <div className="truncate">{t.name}</div>
                      <div className="mono text-[10px] text-faint">{(t.distanceM / 1000).toFixed(1)} km · D+ {t.ascentM === null ? "n/d" : Math.round(t.ascentM)} m · D− {t.descentM === null ? "n/d" : Math.round(t.descentM)} m</div>
                    </button>
                    <button className="text-faint hover:text-text" aria-label={t.visible ? "Masquer" : "Afficher"} onClick={() => update((p) => ({ ...p, gpxTracks: p.gpxTracks.map((x) => x.id === t.id ? { ...x, visible: !x.visible } : x) }), `${t.visible ? "Masqué" : "Affiché"} : ${t.name}`)}>
                      {t.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                    <button className="text-faint hover:text-danger" aria-label={`Supprimer ${t.name}`} onClick={() => update((p) => ({ ...p, gpxTracks: p.gpxTracks.filter((x) => x.id !== t.id) }), `GPX supprimé : ${t.name}`)}><Trash2 size={14} /></button>
                  </li>
                ))}
              </ul>
            )}
            {track && (
              <div className="mt-3 rounded-lg border border-line bg-bg/50 p-3">
                <ElevationProfile series={[
                  { label: "Altitude GPX (fichier)", color: "#2ad4ee", points: gpxProfile },
                  ...(dem[track.id] ? [{ label: `Relief ${PROVIDERS["ion-world-terrain"]!.label}`, color: "#f5b84a", points: dem[track.id]!, dashed: true }] : []),
                ]} />
                <div className="mt-2 flex items-center justify-between gap-2 text-[10.5px] text-faint">
                  <span>Stats calculées sur les {track.originalPointCount} points du fichier ; D+/D− filtrés à 3 m.</span>
                  {terrainAvailable && !dem[track.id] && <button className="btn h-7 shrink-0 px-2 text-[11px]" onClick={compareDem} disabled={demBusy}><Mountain size={12} />{demBusy ? "…" : "Relief"}</button>}
                </div>
              </div>
            )}
          </section>

          {/* Placement */}
          <section>
            <div className="label mb-2">Positionnement</div>
            <div className="grid grid-cols-2 gap-2">
              {(["takeoff", "subject"] as const).map((m) => {
                const pt = project?.scene[m];
                return (
                  <button key={m} className={`btn h-auto flex-col items-start gap-0.5 py-2 text-left ${pickMode === m ? "border-cyan/70" : ""}`} disabled={!project} onClick={() => setPickMode(pickMode === m ? null : m)}>
                    <span className="flex items-center gap-1.5 text-xs"><Crosshair size={13} className={m === "takeoff" ? "text-accent" : "text-warn"} />{m === "takeoff" ? "Décollage" : "Sujet"}</span>
                    <span className="mono text-[10px] text-faint">{pt ? (pt.terrain ? `${Math.round(pt.terrain.valueM)} m terrain` : "placé · alt. n/d") : "à placer"}</span>
                  </button>
                );
              })}
            </div>
            <button className="btn mt-2 h-8 w-full justify-center text-xs" onClick={saveView} disabled={!project}><Camera size={13} />Enregistrer la vue 3D dans le projet</button>
            <p className="mt-1.5 text-[10.5px] leading-relaxed text-faint">Altitudes de terrain (MSL) issues de {PROVIDERS["ion-world-terrain"]!.label}, distinctes des hauteurs de vol. Les obstacles (câbles, arbres…) ne sont pas représentés.</p>
          </section>

          {/* Layers */}
          <section>
            <div className="label mb-2 flex items-center gap-1.5"><Layers size={12} />Couches</div>
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              <Toggle on={imagery === "satellite"} disabled={!hasIonToken} onClick={() => setImagery("satellite")} label="Satellite" />
              <Toggle on={imagery === "map"} onClick={() => setImagery("map")} label="Carte" />
              <Toggle on={terrain && terrainAvailable} disabled={!terrainAvailable} onClick={() => setTerrain((t) => !t)} label="Relief 3D" />
              <Toggle on={showTracks} onClick={() => setShowTracks((v) => !v)} label="Parcours GPX" />
              <Toggle on={showMarkers} onClick={() => setShowMarkers((v) => !v)} label="Points" />
              <Toggle on={false} disabled label="Zones (à venir)" />
            </div>
          </section>

          {/* Quality */}
          <section>
            <div className="label mb-2">Qualité graphique {quality.auto && <span className="normal-case tracking-normal text-faint">· auto</span>}</div>
            <div className="grid grid-cols-4 gap-1">
              {(Object.keys(QUALITY_LEVELS) as Quality[]).map((q) => (
                <button key={q} className={`btn h-8 justify-center px-0 text-xs ${quality.value === q ? "border-accent/70 bg-surface-3" : "text-muted"}`} onClick={() => { persistQuality(q); setQualityState({ value: q, auto: false }); }}>{QUALITY_LEVELS[q].label}</button>
              ))}
            </div>
          </section>

          <section className="border-t border-line pt-3 text-[10.5px] leading-relaxed text-faint">
            <div className="flex items-center gap-1.5"><LocateFixed size={11} />Sources : {status?.terrain === "world-terrain" ? PROVIDERS["ion-world-terrain"]!.label : "ellipsoïde WGS84 (sans relief)"} · {status?.imagery === "ion-aerial" && imagery === "satellite" ? PROVIDERS["ion-aerial"]!.label : PROVIDERS.osm!.label}. Données streamées, non stockées hors ligne.</div>
          </section>
        </div>
      </aside>
    </div>
  );
}

function Toggle({ on, onClick, label, disabled }: { on: boolean; onClick?: () => void; label: string; disabled?: boolean }) {
  return (
    <button className={`flex h-8 items-center gap-2 rounded-lg border px-2.5 transition-colors disabled:opacity-40 ${on ? "border-cyan/50 bg-cyan/10 text-text" : "border-line text-muted hover:text-text"}`} onClick={onClick} disabled={disabled} aria-pressed={on}>
      <span className={`h-1.5 w-1.5 rounded-full ${on ? "bg-cyan" : "bg-faint"}`} />{label}
    </button>
  );
}
