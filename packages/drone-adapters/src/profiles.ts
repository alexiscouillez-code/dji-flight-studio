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

export const DRONE_PROFILES: Record<string, DroneProfile> = { [DJI_NEO_2.id]: DJI_NEO_2 };

export function getDroneProfile(id: string): DroneProfile | null {
  return DRONE_PROFILES[id] ?? null;
}

export function supportedCapabilities(p: DroneProfile): Capability[] {
  return (Object.keys(p.capabilities) as Capability[]).filter((c) => p.capabilities[c].status === "supported");
}
