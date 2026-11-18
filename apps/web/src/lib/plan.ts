import type { Project } from "@dfs/shared-types";
import { planSequence, sampleSequence } from "@dfs/cinematic-engine";
import { buildSceneFrame } from "./scene";

/** Deterministic plan of a project: scene frame + sequence + 10 Hz samples (shared by Companion and missions). */
export function computePlan(project: Project) {
  const frame = buildSceneFrame(project);
  if (!frame || !project.timeline.length) return null;
  const ctx = { subjectTrack: frame.subjectTrack, customPath: frame.waypointPath, subjectHeightM: project.camera.subjectHeightM };
  const plan = planSequence(project.timeline);
  return { frame, plan, samples: sampleSequence(plan, ctx, 10) };
}
