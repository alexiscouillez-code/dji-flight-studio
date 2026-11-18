import {
  Camera, Clapperboard, Cog, FolderKanban, Gauge, Globe2, PlayCircle, Radio, Route, ShieldCheck, GanttChart,
  type LucideIcon,
} from "lucide-react";

export type ModuleStatus = "ready" | "partial" | "planned";

export interface StudioModule {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  phase: number;
  status: ModuleStatus;
  summary: string;
  /** What exists today, stated plainly. */
  available: string[];
  /** What is planned, with the phase. */
  planned: string[];
}

export const MODULES: StudioModule[] = [
  { id: "dashboard", label: "Dashboard", href: "/", icon: Gauge, phase: 1, status: "ready",
    summary: "Vue d'ensemble des projets et de l'état réel du studio.",
    available: ["Projets récents", "Compatibilité matérielle", "Statut des modules"], planned: [] },
  { id: "virtual-world", label: "Virtual World", href: "/virtual-world", icon: Globe2, phase: 2, status: "ready",
    summary: "Globe 3D CesiumJS, relief réel, imagerie, recherche de lieux, import GPX, profil altimétrique.",
    available: ["Globe CesiumJS + Cesium World Terrain", "Imagerie satellite / carte OSM", "Recherche lieux et coordonnées", "Import GPX + profil GPX vs relief", "Décollage / sujet / vue enregistrés", "Qualité Low → Ultra"],
    planned: ["Zones aéronautiques officielles", "Copernicus DEM", "Obstacles cartographiés"] },
  { id: "flight-designer", label: "Flight Designer", href: "/flight-designer", icon: Route, phase: 3, status: "planned",
    summary: "Éditeur de trajectoires 3D : waypoints, splines, orbites, spirales.",
    available: ["Moteur de trajectoire testé : spline Catmull-Rom centripète, longueurs 3D, durées estimées (profil trapézoïdal)"],
    planned: ["Placement et déplacement des waypoints dans la scène", "Orbite, spirale, ascension, suivi", "Statistiques en direct"] },
  { id: "cinematic-library", label: "Cinematic Library", href: "/cinematic-library", icon: Clapperboard, phase: 3, status: "planned",
    summary: "20 mouvements cinématiques paramétrables avec prévisualisation animée.",
    available: [], planned: ["Orbit, Reveal, Push In, Pull Out, Follow…", "Presets réutilisables"] },
  { id: "camera-director", label: "Camera Director", href: "/camera-director", icon: Camera, phase: 3, status: "planned",
    summary: "Caméra virtuelle indépendante du drone, cadrage et point de regard.",
    available: [], planned: ["Vue caméra drone", "Look-at sujet", "FOV, inclinaison, cadrage"] },
  { id: "timeline", label: "Timeline", href: "/timeline", icon: GanttChart, phase: 3, status: "planned",
    summary: "Séquençage des plans, scrubbing, vitesse de lecture.",
    available: [], planned: ["Pistes de mouvements", "Transitions", "Synchronisation scène 3D"] },
  { id: "simulator", label: "Simulator", href: "/simulator", icon: PlayCircle, phase: 3, status: "planned",
    summary: "Lecture temps réel de la trajectoire avec inertie configurable.",
    available: [], planned: ["Lecture / pause / retour", "Vue drone, libre, sujet", "Rapier pour collisions virtuelles"] },
  { id: "drone-connection", label: "Drone Connection", href: "/drone-connection", icon: Radio, phase: 1, status: "partial",
    summary: "Fiches de compatibilité et système de capacités.",
    available: ["Fiche DJI Neo 2 sourcée", "Système de capacités", "Interface DroneAdapter sans fausse implémentation"],
    planned: ["Companion Mode Neo 2 (Phase 4)", "Adaptateurs SDK officiels (Phase 5)"] },
  { id: "flight-safety", label: "Flight Safety", href: "/flight-safety", icon: ShieldCheck, phase: 1, status: "partial",
    summary: "Vérifications pré-vol sur 4 niveaux et validation humaine.",
    available: ["Évaluation des projets (hauteur, référentiel, limites connues)", "Check-list humaine obligatoire"],
    planned: ["Zones aéronautiques officielles sourcées", "Couche obstacles"] },
  { id: "projects", label: "Projects", href: "/projects", icon: FolderKanban, phase: 1, status: "ready",
    summary: "Création, édition, duplication, archivage, export/import JSON versionné.",
    available: ["CRUD complet", "Format JSON versionné + migrations", "Stockage local ou Supabase"], planned: [] },
  { id: "settings", label: "Settings", href: "/settings", icon: Cog, phase: 1, status: "ready",
    summary: "Compte, stockage et préférences.", available: ["Compte Supabase", "Envoi des projets locaux vers le cloud"], planned: [] },
];

export const PRIMARY_NAV = MODULES;
export const getModule = (id: string) => MODULES.find((m) => m.id === id)!;
