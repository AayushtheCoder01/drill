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
import { PERSONAL_PROJECT_ID as PERSONAL_ID, isPersonalProject as isPersonal } from "@/lib/migrate";
import type { Project } from "@/types";

export {
  makeProject,
  DEFAULT_PROJECT_NAME,
  PERSONAL_PROJECT_ID,
  PERSONAL_PROJECT_NAME,
  isPersonalProject
} from "@/lib/migrate";

/** Every project, oldest first. Archived ones included unless asked to hide
 *  them — the switcher hides them by default but must still show the active
 *  one even if it was somehow left archived.
 *
 *  The personal space is a project in the database and not one here: it is a
 *  place to put chats that belong to no body of work, so listing it among the
 *  bodies of work is the one presentation that would make it confusing. Read
 *  it with personal() instead. */
export function list(opts: { includeArchived?: boolean } = {}): Project[] {
  const all = Object.values(store.projects()).filter((p) => !isPersonal(p.id));
  const visible = opts.includeArchived ? all : all.filter((p) => !p.archived || p.id === store.get().activeProjectId);
  return visible.sort((a, b) => a.created - b.created);
}

/** The personal space. Guaranteed by the migration, which runs as the repair
 *  pass on every load, so this never has to cope with it being absent. */
export function personal(): Project {
  return store.projects()[PERSONAL_ID];
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
