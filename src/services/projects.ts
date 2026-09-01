/* ============================================================================
 * projects.ts — the project-facing surface of the store.
 *
 * The mutations themselves live in store.ts (same pattern as deck CRUD:
 * addDeck/renameDeck/deleteDeck live there too, right beside the `db` they
 * close over) so they can call the module-private notify()/saveNow() pair
 * directly. This file is the stable import for UI code and re-exports the
 * project factory from lib/migrate.ts, which owns it for the reason
 * documented there — the migration needs it before a service layer exists.
 * ========================================================================== */
import * as store from "./store";
import type { Project } from "@/types";

export { makeProject, DEFAULT_PROJECT_NAME } from "@/lib/migrate";

/** Every project, oldest first. Archived ones included unless asked to hide
 *  them — the switcher hides them by default but must still show the active
 *  one even if it was somehow left archived. */
export function list(opts: { includeArchived?: boolean } = {}): Project[] {
  const all = Object.values(store.projects());
  const visible = opts.includeArchived ? all : all.filter((p) => !p.archived || p.id === store.get().activeProjectId);
  return visible.sort((a, b) => a.created - b.created);
}

export function get(id: string): Project | undefined {
  return store.projects()[id];
}

export function active(): Project {
  return store.activeProject();
}

export const create = store.createProject;
export const rename = store.renameProject;
export const update = store.updateProject;
export const updateDefaults = store.updateProjectDefaults;
export const updateMemoryPolicy = store.updateMemoryPolicy;
export const archive = store.archiveProject;
export const setActive = store.setActiveProject;
export const decksOf = store.decksOf;
export const notesOf = store.notesOf;
export const setDeckProject = store.setDeckProject;
export const addKnowledge = store.addKnowledge;
export const removeKnowledge = store.removeKnowledge;
export const setKnowledgeEnabled = store.setKnowledgeEnabled;
