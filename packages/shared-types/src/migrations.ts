import { CURRENT_PROJECT_SCHEMA_VERSION, ProjectSchema, type Project } from "./project";

type Raw = Record<string, unknown>;
type Migration = (input: Raw) => Raw;

/**
 * Registry: key N migrates a document from version N to N+1.
 * Version 0 = document without `schemaVersion` (hand-written or pre-versioning).
 */
const MIGRATIONS: Record<number, Migration> = {
  0: (doc) => ({ ...doc, schemaVersion: 1 }),
  // v2 (Phase 2): GPX tracks stored in the project + geographic scene (take-off, subject, saved view).
  1: (doc) => ({ ...doc, gpxTracks: [], scene: {}, schemaVersion: 2 }),
};

export class ProjectMigrationError extends Error {}

export function detectVersion(doc: Raw): number {
  const v = doc.schemaVersion;
  if (v === undefined) return 0;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
    throw new ProjectMigrationError(`schemaVersion invalide : ${String(v)}`);
  }
  return v;
}

/** Migrates any known version to the current one, then validates strictly. */
export function migrateProject(input: unknown): Project {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new ProjectMigrationError("Le projet doit être un objet JSON.");
  }
  let doc = input as Raw;
  let version = detectVersion(doc);
  if (version > CURRENT_PROJECT_SCHEMA_VERSION) {
    throw new ProjectMigrationError(
      `Version ${version} plus récente que celle supportée (${CURRENT_PROJECT_SCHEMA_VERSION}). Mettez l'application à jour.`,
    );
  }
  while (version < CURRENT_PROJECT_SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) throw new ProjectMigrationError(`Aucune migration depuis la version ${version}.`);
    doc = step(doc);
    version += 1;
  }
  const parsed = ProjectSchema.safeParse(doc);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new ProjectMigrationError(
      `Projet invalide : ${first ? `${first.path.join(".") || "(racine)"} — ${first.message}` : "erreur inconnue"}`,
    );
  }
  return parsed.data;
}
