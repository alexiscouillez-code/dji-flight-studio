# DJI FLIGHT STUDIO — Architecture technique

> Statut : Phase 1 livrée (socle). Ce document couvre les livrables 1 à 5, 8 et 9 de la « première mission ».
> Les livrables 6 (compatibilité DJI) et 7 (base de données) sont dans `docs/compatibility/` et `docs/api/`.

## 1. Principes

| Principe | Application concrète |
|---|---|
| Moteurs déterministes hors de React | Toute géométrie, tout calcul et toute règle de sécurité vivent dans `packages/*`, en TypeScript pur, testés avec Vitest. Les composants React ne font qu'afficher. |
| Un seul moteur par responsabilité | Chaque package a une responsabilité unique ; les dépendances vont toujours vers `shared-types` (aucun cycle). |
| Honnêteté technique | Les modules non construits sont visibles mais marqués « Phase N » et décrivent ce qui existe réellement. Aucune télémétrie, connexion ou simulation n'est inventée. |
| Référentiels explicites | Toute altitude porte sa référence (`terrain_msl`, `drone_amsl`, `takeoff_relative`, `agl`, `virtual`) et sa source. Le moteur de trajectoire refuse de mélanger les référentiels. |
| Format versionné | Projets en JSON `schemaVersion` + chaîne de migrations ; validation Zod stricte à chaque lecture/import. |

## 2. Vue d'ensemble

```
                ┌───────────────────────── apps/web (Next.js 15, React 19, Tailwind 4) ─────────────────────────┐
                │  UI / pages  ──►  lib/store (état)  ──►  lib/repository (Local | Supabase)                    │
                └───────┬───────────────┬────────────────────┬───────────────────────┬───────────────────────────┘
                        │               │                    │                       │
              @dfs/flight-safety  @dfs/trajectory-engine  @dfs/geographic-engine  @dfs/drone-adapters
                        │               │      └──────────────┤                       │
                        └───────────────┴─────────────► @dfs/shared-types (Zod) ◄─────┘
                                                              │
                                     Supabase (Auth, Postgres + RLS, Storage)  ◄── backend/supabase/migrations
```

Futurs modules (réservés, vides tant qu'ils ne sont pas réels) : `virtual-world`, `flight-simulator`,
`cinematic-engine`, `camera-director`, `dji-adapter`, `ui`, et `apps/ios`.

## 2bis. Arborescence

```
dji-flight-studio/
├── apps/
│   ├── web/                      Next.js — App Router
│   │   └── src/
│   │       ├── app/              1 dossier = 1 module de la navigation (11 entrées)
│   │       ├── components/       Shell, PageHeader, CheckItem, MoveGlyph, PlannedModule…
│   │       └── lib/              store, repository, projects (CRUD/export/import), supabase, modules
│   └── ios/                      (Phase 5) app Swift + WKWebView — nécessite macOS/Xcode
├── packages/
│   ├── shared-types/             Schémas Zod, référentiels d'altitude, format projet + migrations
│   ├── geographic-engine/        WGS84 ↔ ECEF ↔ ENU, haversine, cap, parsing coordonnées, GPX + D+/D-
│   ├── trajectory-engine/        Catmull-Rom centripète, longueurs 3D, profil de vitesse trapézoïdal
│   ├── drone-adapters/           Système de capacités, interface DroneAdapter, fiches drones sourcées
│   ├── flight-safety/            Évaluation pré-vol 4 niveaux, check-list humaine
│   ├── virtual-world/ cinematic-engine/ camera-director/ flight-simulator/ dji-adapter/ ui/   (réservés)
├── backend/
│   ├── supabase/migrations/      Schéma SQL + RLS + bucket Storage
│   ├── supabase/tests/rls.mjs    Test RLS exécuté dans un Postgres embarqué (PGlite)
│   └── missions/ profiles/ projects/ storage/   (logique serveur future)
└── docs/ architecture/ compatibility/ safety/ api/
```

## 3. Stratégie d'intégration CesiumJS (Phase 2)

**Choix : Cesium pour le monde, Three.js pour les objets du studio — deux canvases synchronisés, pas deux moteurs concurrents.**

1. **Fondation** — `cesium` (pas `resium` au départ, pour garder la maîtrise du cycle de vie) chargé uniquement côté client via `next/dynamic({ ssr: false })` sur la route `/virtual-world`. Les assets Cesium (`Workers`, `Assets`, `Widgets`) sont copiés dans `public/cesium` au build et `CESIUM_BASE_URL` est défini. Aucun coût sur les autres pages.
2. **Terrain** — `Cesium World Terrain` (Cesium ion, token **public restreint par domaine** en `NEXT_PUBLIC_CESIUM_ION_TOKEN`). Copernicus DEM GLO-30 en second fournisseur après vérification de licence et via un service de tuiles quantized-mesh dédié.
3. **Imagerie** — interface `ImageryProviderAdapter { id, licence, attribution, maxZoom, offlineAllowed, create() }`. Premier fournisseur : Cesium ion (Bing/Sentinel-2 selon offre). Chaque fournisseur déclare ses droits ; `offlineAllowed=false` interdit toute mise en cache persistante.
4. **Géocodage** — interface `GeocoderAdapter.search(q) → {label, lat, lon, bbox, source}[]`. `parseCoordinates()` (déjà livré) court-circuite le géocodage pour les coordonnées saisies.
5. **GPX** — `parseGpx()` + `computeGpxStats()` (déjà livrés et testés) → `PolylineCollection` clampée au terrain ; profil altimétrique en SVG avec `sampleTerrainMostDetailed` pour comparer `ele` GPX et altitude DEM (affichage des deux, sources indiquées).
6. **Pont Cesium ↔ Three.js** — repère ENU local ancré sur le centre de la scène (`createEnuFrame`, livré, précision < 1 mm testée). La caméra Three.js copie à chaque frame la matrice vue/projection de Cesium ; Three.js rend drone, sujet, trajectoire, gizmos dans un canvas transparent superposé. Hauteurs : la conversion `takeoff_relative → drone_amsl` passe par l'altitude terrain du point de décollage (Cesium `sampleTerrainMostDetailed`), jamais implicitement.
7. **Performance** — `maximumScreenSpaceError` adapté au niveau Low/Medium/High/Ultra, `requestRenderMode=true` (rendu à la demande), plafond d'objets Three.js, `tileCacheSize` borné, détection via `navigator.hardwareConcurrency` + test FPS au premier chargement.

## 4. Stratégie de simulation 3D (Phase 3)

- **Temps** : une horloge unique `SimClock` (t ∈ [0, durée], vitesse de lecture, scrubbing) ; la Timeline, la scène et la caméra lisent toutes la même horloge.
- **Cinématique déterministe d'abord** : la position du drone à l'instant t est calculée par le `trajectory-engine` (abscisse curviligne + profil de vitesse). C'est reproductible et testable.
- **Physique optionnelle ensuite** : Rapier (`@dimforge/rapier3d-compat`, WASM) uniquement pour l'inertie de suivi et les collisions virtuelles avec le terrain/bâtiments maillés. Le corps rigide suit la consigne cinématique par un contrôleur PD borné (accélération max configurable).
- **Honnêteté** : toutes les sorties portent `isSimulation: true` (déjà le cas dans `TrajectoryStats`) et l'UI les affiche comme estimations. Aucun paramètre n'est présenté comme une performance réelle du Neo 2.

## 5. Architecture du moteur cinématique (Phase 3)

```
Intention (UI ou IA) ─► MovePreset (JSON validé Zod) ─► cinematic-engine.generate() ─► Waypoint[] + CameraTrack
                                                              │
                                    trajectory-engine (géométrie, durées)   camera-director (look-at, FOV, cadrage)
                                                              │
                                                   Timeline (séquences, transitions)
```

- Chaque mouvement de la bibliothèque (20) est une **fonction pure** `generate(params, context) → { waypoints, cameraTrack }` : `context` = sujet, point de départ, référentiel d'altitude, contraintes de sécurité.
- Les transitions entre plans raccordent position **et** tangente (continuité C1 via Catmull-Rom + points fantômes).
- La caméra est **indépendante** du drone : `CameraTrack` = suite de clés (lookAt cible|direction, pitch, FOV) interpolées (slerp pour l'orientation).
- L'**assistant IA** ne produit qu'un `ScenarioDraft` JSON validé par schéma ; il n'appelle jamais un adaptateur drone et ne remplace aucun calcul de sécurité.

## 8. Plan de développement par étapes

| Phase | Contenu | Critère de sortie |
|---|---|---|
| **1 — Foundation** ✅ | Monorepo, design system, navigation 11 modules, dashboard réel, projets CRUD + export/import versionné, Supabase Auth + RLS, moteurs géo/trajectoire/sécurité/capacités testés | Build vert, 42 tests unitaires + test RLS verts, parcours E2E vérifié |
| 2 — Geographic Virtual Studio | Cesium, terrain, imagerie à fournisseurs, géocodage, import GPX sur relief, profil altimétrique, lieux favoris, qualité graphique | Charger Chamonix + un GPX, profil cohérent avec le DEM |
| 3 — Cinematic Engine | Flight Designer (waypoints dans la scène), bibliothèque 20 mouvements, Camera Director, Timeline, Simulator, assistant IA | Créer, prévisualiser et simuler une séquence de 5 plans |
| 4 — Neo 2 Companion | Mode Companion pas-à-pas, check-list, guide DJI Fly | Utilisable sur iPhone en extérieur, hors ligne pour le plan |
| 5 — Universal DJI Adapter | Adaptateurs MSDK sur drones réellement compatibles, télémétrie, missions si supportées, app iOS | Tests sur matériel compatible |
| 6 — Flight Studio Pro | Optimisation, exports avancés, documentation complète | — |

### Prochaine étape immédiate (début Phase 2)
1. Créer le compte Cesium ion et un token restreint au domaine Vercel.
2. `packages/virtual-world` : wrapper Cesium client-only + couche ENU.
3. Interfaces `ImageryProviderAdapter` / `GeocoderAdapter` + premier fournisseur.
4. UI d'import GPX branchée sur `parseGpx` (déjà testé).

## 9. Dépendances

| Paquet | Où | Pourquoi |
|---|---|---|
| next 15, react 19, react-dom 19 | web | App Router, rendu, routing |
| tailwindcss 4, @tailwindcss/postcss | web | Design system via tokens `@theme` |
| geist | web | Polices Geist Sans/Mono embarquées (pas d'appel réseau au build) |
| lucide-react | web | Icônes |
| clsx | web | Classes conditionnelles |
| @supabase/supabase-js | web | Auth + Postgres (clé anon uniquement côté client) |
| zod | shared-types | Schémas et validation stricte |
| fast-xml-parser | geographic-engine | Parsing GPX identique navigateur/Node |
| vitest, typescript | racine | Tests et typage |
| @electric-sql/pglite | racine (dev) | Test RLS sur un vrai Postgres embarqué |

Prévues : `cesium` (P2), `three`, `@react-three/fiber`, `@react-three/drei`, `@dimforge/rapier3d-compat` (P3).
