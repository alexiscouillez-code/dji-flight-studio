import type { Project } from "@dfs/shared-types";
import { ALTITUDE_REFERENCE_LABELS } from "@dfs/shared-types";
import { getDroneProfile } from "@dfs/drone-adapters";

/** Prompt §16 — four distinct levels. */
export type CheckLevel = "info" | "warning" | "technical-block" | "human-validation";

export interface SafetyCheck {
  id: string;
  level: CheckLevel;
  title: string;
  detail: string;
}

export const SAFETY_DISCLAIMER =
  "Une validation dans DJI FLIGHT STUDIO ne constitue jamais une autorisation réglementaire de vol. Les données (relief, obstacles, zones) ne sont pas exhaustives.";

/** Planning reference: EU open category maximum height (120 m from closest point of the earth surface). */
export const EU_OPEN_CATEGORY_MAX_HEIGHT_M = 120;

export interface SafetyContext {
  /** Planned straight-line max distance from take-off (m), if known. */
  maxDistanceFromTakeoffM?: number;
}

export function evaluateMission(project: Project, ctx: SafetyContext = {}): SafetyCheck[] {
  const checks: SafetyCheck[] = [];
  const profile = getDroneProfile(project.droneProfileId);

  if (!profile) {
    checks.push({ id: "drone-unknown", level: "technical-block", title: "Drone inconnu", detail: `Aucun profil de compatibilité pour « ${project.droneProfileId} ».` });
  } else if (profile.mode === "manual-companion") {
    checks.push({ id: "drone-companion", level: "info", title: `${profile.name} : mode Companion`, detail: "Aucune commande n'est envoyée au drone. Le pilotage se fait dans DJI Fly, sous votre contrôle permanent." });
  }

  if (project.waypoints.length === 0) {
    checks.push({ id: "no-waypoints", level: "info", title: "Aucun waypoint", detail: "La trajectoire est vide : rien à vérifier côté altitude ou distance." });
  } else {
    const ref = project.waypoints[0]!.altitude.reference;
    const max = Math.max(...project.waypoints.map((w) => w.altitude.valueM));
    if (ref === "takeoff_relative" || ref === "agl") {
      if (max > EU_OPEN_CATEGORY_MAX_HEIGHT_M) {
        checks.push({ id: "height-120", level: "warning", title: "Hauteur planifiée > 120 m", detail: `Max ${max.toFixed(0)} m (${ALTITUDE_REFERENCE_LABELS[ref]}). Référence de planification : 120 m en catégorie ouverte UE. Vérifiez la réglementation applicable.` });
      }
      if (ref === "takeoff_relative") {
        checks.push({ id: "height-terrain", level: "warning", title: "Hauteur relative au décollage", detail: "En montagne, la hauteur réelle au-dessus du sol peut différer fortement de la hauteur relative au point de décollage." });
      }
    } else {
      checks.push({ id: "height-ref", level: "human-validation", title: "Référentiel d'altitude à confirmer", detail: `Altitudes exprimées en « ${ALTITUDE_REFERENCE_LABELS[ref]} » : la hauteur sol n'est pas vérifiable automatiquement.` });
    }
    if (profile) {
      for (const l of profile.knownLimits) {
        if (max > l.valueM && ref === "takeoff_relative") {
          checks.push({ id: `limit-${l.valueM}`, level: "warning", title: l.label, detail: `${l.valueM} m — ${l.context}. Source : ${l.source.title}.` });
        }
      }
    }
  }

  if (ctx.maxDistanceFromTakeoffM !== undefined && ctx.maxDistanceFromTakeoffM > 500) {
    checks.push({ id: "vlos", level: "warning", title: "Distance importante", detail: `${Math.round(ctx.maxDistanceFromTakeoffM)} m du décollage : vérifiez que le vol reste en vue directe.` });
  }

  checks.push({ id: "airspace", level: "human-validation", title: "Zones réglementées", detail: "Aucune source aéronautique officielle n'est encore intégrée. Consultez la carte officielle (en France : Géoportail — restrictions UAS) et DJI Fly." });
  checks.push({ id: "obstacles", level: "human-validation", title: "Obstacles non cartographiés", detail: "Câbles, arbres, lignes électriques et obstacles temporaires peuvent être absents des données." });
  checks.push({ id: "pilot", level: "human-validation", title: "Validation du pilote", detail: "Batterie, météo, GPS, autorisations et environnement à vérifier sur place." });
  return checks;
}

export const LEVEL_ORDER: Record<CheckLevel, number> = { "technical-block": 0, warning: 1, "human-validation": 2, info: 3 };
export const isBlocking = (checks: SafetyCheck[]) => checks.some((c) => c.level === "technical-block");
