import type { Capability, DroneProfile } from "@dfs/drone-adapters";
import { CAPABILITIES, CAPABILITY_LABELS } from "@dfs/drone-adapters";
import type { Hello } from "./protocol";

export interface EffectiveCapability {
  capability: Capability;
  label: string;
  enabled: boolean;
  /** Needs an explicit pilot acknowledgement because the hardware was never validated by us. */
  needsAck: boolean;
  reason: string;
}

/**
 * Capability detection: a function is usable only if (1) the drone profile does not rule it out,
 * (2) the connected bridge declares it at runtime, and (3) the aircraft reported by the bridge
 * matches the selected profile. Unverified profiles require a pilot acknowledgement.
 */
export function negotiate(profile: DroneProfile, hello: Hello | null): EffectiveCapability[] {
  return CAPABILITIES.filter((c) => c !== "manual-companion").map((c) => {
    const st = profile.capabilities[c];
    const base = { capability: c, label: CAPABILITY_LABELS[c] };
    if (st.status === "not-supported") return { ...base, enabled: false, needsAck: false, reason: st.reason };
    if (!hello) return { ...base, enabled: false, needsAck: false, reason: "Aucun pont connecté." };
    if (!hello.aircraft) return { ...base, enabled: false, needsAck: false, reason: "Le pont ne détecte aucun appareil." };
    if (hello.aircraft.profileId && hello.aircraft.profileId !== profile.id)
      return { ...base, enabled: false, needsAck: false, reason: `Appareil connecté (${hello.aircraft.model}) différent du profil du projet (${profile.name}).` };
    if (!hello.capabilities.includes(c)) return { ...base, enabled: false, needsAck: false, reason: "Non déclarée par le pont connecté." };
    return { ...base, enabled: true, needsAck: st.status !== "supported", reason: st.status === "supported" ? `Via ${hello.sdk.name} ${hello.sdk.version}` : "Déclarée par le pont ; matériel non validé par DJI FLIGHT STUDIO." };
  });
}

export const isEnabled = (caps: EffectiveCapability[], c: Capability) => caps.find((x) => x.capability === c)?.enabled ?? false;
