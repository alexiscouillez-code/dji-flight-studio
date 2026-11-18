import type { Capability, SupportStatus } from "./capabilities";

export interface Source { title: string; url: string }

export interface DroneProfile {
  id: string;
  name: string;
  manufacturer: "DJI";
  /** Integration level offered by DJI FLIGHT STUDIO. */
  mode: "manual-companion" | "sdk-adapter";
  /** Date the compatibility sheet was last checked against sources (ISO date). */
  verifiedOn: string;
  firmwareChecked: string | null;
  controllers: string[];
  capabilities: Record<Capability, SupportStatus>;
  /** Hard planning limits known from official documentation. */
  knownLimits: { label: string; valueM: number; context: string; source: Source }[];
  notes: string[];
  sources: Source[];
}

const NO_SDK =
  "Aucun SDK officiel DJI identifié pour ce modèle à la date de vérification. DJI FLIGHT STUDIO ne communique pas avec l'appareil.";

export const DJI_NEO_2: DroneProfile = {
  id: "dji-neo-2",
  name: "DJI Neo 2",
  manufacturer: "DJI",
  mode: "manual-companion",
  verifiedOn: "2026-11-17",
  firmwareChecked: null,
  controllers: ["DJI RC-N2", "DJI RC-N3", "DJI RC 2", "Smartphone (Wi-Fi)"],
  capabilities: {
    telemetry: { status: "not-supported", reason: NO_SDK, manualWorkflow: "Lire la télémétrie dans DJI Fly." },
    camera: { status: "not-supported", reason: NO_SDK, manualWorkflow: "Régler la caméra dans DJI Fly." },
    gimbal: { status: "not-supported", reason: NO_SDK, manualWorkflow: "Piloter la nacelle à la radiocommande." },
    mission: { status: "not-supported", reason: NO_SDK, manualWorkflow: "Reproduire le plan manuellement avec le guide Companion." },
    waypoint: { status: "not-supported", reason: NO_SDK, manualWorkflow: "Utiliser les modes intelligents natifs de DJI Fly le cas échéant." },
    "manual-companion": { status: "supported", via: "DJI FLIGHT STUDIO (aucune liaison avec le drone)" },
  },
  knownLimits: [
    {
      label: "Hauteur max en contrôle par application mobile",
      valueM: 60,
      context: "Contrôle via smartphone (Wi-Fi), sans radiocommande",
      source: { title: "DJI Neo 2 — FAQ officielle", url: "https://www.dji.com/neo-2/faq" },
    },
  ],
  notes: [
    "DJI Fly reste responsable du pilotage et de toutes les fonctions natives.",
    "MSDK V5 est disponible uniquement sur Android ; le Neo 2 n'apparaît pas dans les listes de produits supportés consultées.",
    "Aucune lecture d'écran, aucune automatisation de DJI Fly, aucune communication avec la radiocommande.",
  ],
  sources: [
    { title: "DJI Neo 2 — FAQ", url: "https://www.dji.com/neo-2/faq" },
    { title: "DJI Neo 2 — Release Notes", url: "https://dl.djicdn.com/downloads/DJI_Neo_2/RN/20251107/DJI_Neo_2_Release_Notes_en.pdf" },
    { title: "MSDK V5 — appareils supportés (DJI SDK Forum)", url: "https://sdk-forum.dji.net/hc/en-us/articles/25552010279961-What-devices-does-Mobile-SDK-V5-support" },
    { title: "MSDK — Release Notes", url: "https://developer.dji.com/doc/mobile-sdk-tutorial/en" },
  ],
};

const MSDK_SOURCES: Source[] = [
  { title: "DJI MSDK V5 — Release Notes (produits supportés)", url: "https://developer.dji.com/doc/mobile-sdk-tutorial/en" },
  { title: "MSDK V5 — appareils supportés (DJI SDK Forum)", url: "https://sdk-forum.dji.net/hc/en-us/articles/25552010279961-What-devices-does-Mobile-SDK-V5-support" },
  { title: "DJI Mobile SDK Android V5 (GitHub)", url: "https://github.com/dji-sdk/Mobile-SDK-Android-V5" },
];
const UNTESTED = "Documenté par DJI Mobile SDK V5 (Android uniquement). Aucun adaptateur natif n'a encore été testé sur ce matériel : la fonction ne s'active que si un pont DJI FLIGHT STUDIO connecté la déclare.";

/** Aircraft listed by DJI as supported by MSDK V5. Capabilities stay "unverified" until tested on hardware. */
function msdkProfile(id: string, name: string, controllers: string[], sinceMsdk: string, extraNote?: string): DroneProfile {
  const u = { status: "unverified", reason: UNTESTED } as const;
  return {
    id, name, manufacturer: "DJI", mode: "sdk-adapter", verifiedOn: "2026-11-18", firmwareChecked: null, controllers,
    capabilities: { telemetry: u, camera: u, gimbal: u, mission: u, waypoint: u, "manual-companion": { status: "supported", via: "DJI FLIGHT STUDIO (guide manuel, sans liaison)" } },
    knownLimits: [],
    notes: [
      `Supporté par MSDK V5 depuis la version ${sinceMsdk} (Android).`,
      "MSDK V5 n'existe pas sur iOS : l'intégration passe par une application Android « pont ».",
      ...(extraNote ? [extraNote] : []),
    ],
    sources: MSDK_SOURCES,
  };
}

export const DJI_MINI_4_PRO = msdkProfile("dji-mini-4-pro", "DJI Mini 4 Pro", ["DJI RC-N2"], "5.13.0", "Avec la radiocommande DJI RC-N2 uniquement (pas la DJI RC 2).");
export const DJI_MINI_3_PRO = msdkProfile("dji-mini-3-pro", "DJI Mini 3 Pro", ["DJI RC-N1"], "5.3.0", "La DJI RC (écran intégré) n'est pas listée.");
export const DJI_MINI_3 = msdkProfile("dji-mini-3", "DJI Mini 3", ["DJI RC-N1"], "5.3.0", "La DJI RC (écran intégré) n'est pas listée.");
export const DJI_MATRICE_30 = msdkProfile("dji-matrice-30", "DJI Matrice 30 Series", ["DJI RC Plus"], "5.0.0");
export const DJI_MATRICE_350 = msdkProfile("dji-matrice-350-rtk", "DJI Matrice 350 RTK", ["DJI RC Plus"], "5.4.0");
export const DJI_MATRICE_4E = msdkProfile("dji-matrice-4e", "DJI Matrice 4E / 4T", ["DJI RC Plus 2"], "≤ 5.12.0");

export const DRONE_PROFILES: Record<string, DroneProfile> = Object.fromEntries(
  [DJI_NEO_2, DJI_MINI_4_PRO, DJI_MINI_3_PRO, DJI_MINI_3, DJI_MATRICE_30, DJI_MATRICE_350, DJI_MATRICE_4E].map((p) => [p.id, p]),
);

export function getDroneProfile(id: string): DroneProfile | null {
  return DRONE_PROFILES[id] ?? null;
}

export function supportedCapabilities(p: DroneProfile): Capability[] {
  return (Object.keys(p.capabilities) as Capability[]).filter((c) => p.capabilities[c].status === "supported");
}
