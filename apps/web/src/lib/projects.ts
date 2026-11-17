import {
  CURRENT_PROJECT_SCHEMA_VERSION,
  PROJECT_EXPORT_FORMAT,
  ProjectExportSchema,
  migrateProject,
  type Project,
} from "@dfs/shared-types";

const now = () => new Date().toISOString();
const HISTORY_MAX = 200;

export function withHistory(p: Project, action: string): Project {
  const at = now();
  return { ...p, updatedAt: at, history: [...p.history, { at, action }].slice(-HISTORY_MAX) };
}

export function createProject(name: string, description = ""): Project {
  const at = now();
  return migrateProject({
    schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
    id: crypto.randomUUID(),
    name: name.trim() || "Projet sans titre",
    description,
    createdAt: at,
    updatedAt: at,
    history: [{ at, action: "Projet créé" }],
  });
}

export function duplicateProject(p: Project): Project {
  const at = now();
  return {
    ...structuredClone(p),
    id: crypto.randomUUID(),
    name: `${p.name} (copie)`.slice(0, 120),
    archived: false,
    createdAt: at,
    updatedAt: at,
    history: [{ at, action: `Dupliqué depuis « ${p.name} »` }],
  };
}

export function exportProject(p: Project): string {
  return JSON.stringify(
    { format: PROJECT_EXPORT_FORMAT, schemaVersion: p.schemaVersion, exportedAt: now(), project: p },
    null,
    2,
  );
}

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

/** Validates, migrates and re-identifies an imported project (new UUID avoids collisions). */
export function importProject(text: string): Project {
  if (text.length > MAX_IMPORT_BYTES) throw new Error("Fichier trop volumineux (max 5 Mo).");
  let json: unknown;
  try { json = JSON.parse(text); } catch { throw new Error("Le fichier n'est pas un JSON valide."); }
  const env = ProjectExportSchema.safeParse(json);
  const raw = env.success ? env.data.project : json; // also accept a bare project object
  const p = migrateProject(raw);
  const at = now();
  return { ...p, id: crypto.randomUUID(), updatedAt: at, history: [...p.history, { at, action: "Importé depuis un fichier" }].slice(-HISTORY_MAX) };
}

export function downloadText(filename: string, text: string, mime = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const slugify = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "projet";
