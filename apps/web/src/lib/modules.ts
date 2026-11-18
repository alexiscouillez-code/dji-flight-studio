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
  { id: "flight-designer", label: "Flight Designer", href: "/flight-designer", icon: Route, phase: 3, status: "ready",
    summary: "Éditeur de trajectoires 3D : waypoints posés et déplacés sur le globe, spline ou lignes droites.",
    available: ["Ajout / déplacement des waypoints dans la scène", "Hauteur, vitesse, pause, nacelle par point", "Distance, durée, vitesses, segments, dégagement relief", "Envoi vers la timeline"], planned: ["Orbites et spirales générées depuis un waypoint"] },
  { id: "cinematic-library", label: "Cinematic Library", href: "/cinematic-library", icon: Clapperboard, phase: 3, status: "ready",
    summary: "20 mouvements cinématiques paramétrables, aperçus calculés par le moteur.",
    available: ["20 mouvements + trajectoire personnalisée", "Paramètres et durée", "Presets (compte ou navigateur)", "Ajout direct à la timeline"], planned: [] },
  { id: "camera-director", label: "Camera Director", href: "/camera-director", icon: Camera, phase: 3, status: "ready",
    summary: "Caméra virtuelle indépendante du drone : Drone, Cinematic, First Person, Subject, Free.",
    available: ["5 modes caméra", "Champ de vision réglable", "Point visé sur le sujet", "Bandes 2.39:1 et grille des tiers"], planned: [] },
  { id: "timeline", label: "Timeline", href: "/timeline", icon: GanttChart, phase: 3, status: "ready",
    summary: "Séquence de plans avec transitions continues, lecture et scrubbing.",
    available: ["Lecture, pause, stop, ±5 s, vitesses 0.25× à 4×", "Scrubbing", "Transitions continues (position et vitesse)", "Édition, ordre, duplication des plans"], planned: [] },
  { id: "simulator", label: "Simulator", href: "/simulator", icon: PlayCircle, phase: 3, status: "ready",
    summary: "Simulation de la séquence : idéale ou avec inertie, analyse relief et vitesses.",
    available: ["Mode idéal / inertie (vitesse et accélération bornées)", "Collision virtuelle et dégagement au relief", "Vitesse, hauteur, éloignement, distance au sujet", "Alertes horodatées"], planned: ["Rapier pour les obstacles maillés (bâtiments)"] },
  { id: "drone-connection", label: "Drone Connection", href: "/drone-connection", icon: Radio, phase: 1, status: "partial",
    summary: "Fiches de compatibilité, système de capacités et Neo 2 Companion (pilotage manuel guidé).",
    available: ["Fiche DJI Neo 2 sourcée", "Neo 2 Companion : check-list, mise en place, guide plan par plan, minuteur, export, hors ligne", "Système de capacités", "Interface DroneAdapter sans fausse implémentation"],
    planned: ["Adaptateurs SDK officiels (Phase 5)"] },
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
