/* ============================================================================
 * resolveSetting.ts — value plus provenance for the three fields that
 * actually inherit: backend, model, effort. Conversation beats project beats
 * global, exactly the chain the "" sentinels in types/chat.ts and
 * types/core.ts document ("'' means inherit from the project, which may
 * inherit from global — never 'unset it'").
 *
 * Temperature and personaId are deliberately not chained here: a
 * conversation always carries a concrete copy of both (seeded from the
 * project/persona default only once, at creation), because sampling params
 * are meant to be tweaked per-thread, not silently re-inherited every turn.
 * ========================================================================== */
import * as store from "@/services/store";
import type { BackendType, Effort } from "@/types";
import type { Project } from "@/types/core";

export type SettingOrigin = "conversation" | "project" | "global";

export interface Resolved<T> {
  value: T;
  from: SettingOrigin;
}

function chain<T>(conv: T | "" | undefined | null, project: T | "" | undefined | null, global: T): Resolved<T> {
  if (conv) return { value: conv as T, from: "conversation" };
  if (project) return { value: project as T, from: "project" };
  return { value: global, from: "global" };
}

export function resolveBackend(conv?: { backend: BackendType | "" } | null, project?: Project | null): Resolved<BackendType | ""> {
  const s = store.settings();
  return chain(conv?.backend, project?.defaults.backend, (s.backend as BackendType) || "");
}

export function resolveModel(conv?: { model: string } | null, project?: Project | null): Resolved<string> {
  const s = store.settings();
  return chain(conv?.model, project?.defaults.model, s.model || "");
}

export function resolveEffort(conv?: { effort: Effort | "" } | null, project?: Project | null): Resolved<Effort> {
  const s = store.settings();
  return chain(conv?.effort, project?.defaults.effort, s.effort);
}

export function originLabel(o: SettingOrigin): string {
  if (o === "conversation") return "this conversation";
  if (o === "project") return "project default";
  return "global default";
}
