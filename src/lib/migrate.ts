/* ============================================================================
 * migrate.ts — moving a stored database forward a version.
 *
 * v3 -> v4 introduces projects. Everything that existed before belongs to one
 * default project, so the upgrade is additive: no deck, card, review or note
 * is dropped, reordered or rewritten beyond gaining a `projectId`.
 *
 * This module is pure. It never touches storage — store.ts writes the
 * pre-migration backup before calling in here, so a migration that throws
 * leaves the original bytes untouched and recoverable.
 *
 * The project factory lives here rather than in services/projects.ts because
 * the migration needs it and a service importing store.ts (which imports
 * this) would close a cycle. services/projects.ts re-exports it.
 * ========================================================================== */
import * as U from "@/lib/util";
import type {
  Deck,
  DrillDB,
  LegacyDBv3,
  LegacyDeckV3,
  LegacyNoteV3,
  MemoryPolicy,
  Note,
  Project,
  ProjectDefaults
} from "@/types";

/** The database version this build reads and writes. */
export const CURRENT_DB_VERSION = 4;

/** What pre-project decks and notes get filed under. */
export const DEFAULT_PROJECT_NAME = "General";

/**
 * The space for chats that do not belong to anything.
 *
 * Projects are the right container for "I am learning distributed systems for
 * six months". They are the wrong container for "what is the syntax for a bash
 * case statement", and until now there was nowhere to put that question: every
 * conversation was filed under whichever project happened to be active, so a
 * one-off answer landed in the middle of a body of work and stayed there.
 *
 * So there is one project that is not really a project. It is a real record —
 * a fixed id rather than a null, deliberately, because `projects[c.projectId]`
 * is read in a dozen places and every one of them would need a null branch
 * otherwise; a nullable project id is how you white-screen this app. What
 * makes it different is entirely in how it is presented: its own group at the
 * top of the switcher, no goals, no archiving, and chat as the landing view.
 *
 * The id is a literal, not a uuid, so the same install always resolves the
 * same space and a `#/p/personal/chat` link is stable and readable.
 */
export const PERSONAL_PROJECT_ID = "personal";
export const PERSONAL_PROJECT_NAME = "Personal";

export function makePersonalProject(): Project {
  return makeProject(PERSONAL_PROJECT_NAME, {
    id: PERSONAL_PROJECT_ID,
    blurb: "Chats that do not belong to a project"
  });
}

/** True for the one project that is a space rather than a body of work. */
export function isPersonalProject(id: string): boolean {
  return id === PERSONAL_PROJECT_ID;
}

export function blankProjectDefaults(): ProjectDefaults {
  return { backend: "", model: "", personaId: "", effort: "", temperature: null };
}

export function blankMemoryPolicy(): MemoryPolicy {
  return { autonomy: "assisted", maxGlobalInjected: 6, maxProjectInjected: 8 };
}

export interface MakeProjectOpts {
  blurb?: string;
  goals?: string;
  deckIds?: string[];
  id?: string;
}

export function makeProject(name: string, opts: MakeProjectOpts = {}): Project {
  const now = Date.now();
  return {
    id: opts.id || U.uuid(),
    name: name || "Untitled project",
    blurb: opts.blurb || "",
    created: now,
    updated: now,
    archived: false,
    goals: opts.goals || "",
    deckIds: opts.deckIds ? opts.deckIds.slice() : [],
    defaults: blankProjectDefaults(),
    memoryPolicy: blankMemoryPolicy(),
    knowledge: []
  };
}

/* ------------------------------------------------------------- detection -- */

/** Version stamped on a loaded blob. Absent or unparseable reads as 3, which
 *  is the oldest shape this module upgrades (v2 is handled in store.ts). */
export function dbVersionOf(raw: unknown): number {
  if (!raw || typeof raw !== "object") return 0;
  const v = (raw as { v?: unknown }).v;
  return typeof v === "number" && v > 0 ? v : 3;
}

export function needsUpgrade(raw: unknown): boolean {
  const v = dbVersionOf(raw);
  return v > 0 && v < CURRENT_DB_VERSION;
}

/* --------------------------------------------------------------- v3 -> v4 -- */

function upgradeNote(n: LegacyNoteV3 | Note, projectId: string): Note {
  const existing = n as Partial<Note>;
  return {
    id: n.id || U.uuid(),
    projectId: existing.projectId || projectId,
    t: n.t || Date.now(),
    text: n.text || "",
    tag: n.tag || "note",
    source: existing.source || "manual",
    memoryId: existing.memoryId || null,
    attachments: Array.isArray(existing.attachments) ? existing.attachments : []
  };
}

function upgradeDeck(d: LegacyDeckV3, projectId: string): Deck {
  return {
    id: d.id,
    name: d.name,
    created: d.created,
    projectId: d.projectId || projectId,
    cards: Array.isArray(d.cards) ? d.cards : [],
    srs: d.srs || {},
    meta: d.meta
  };
}

/**
 * v3 -> v4. Creates one project, files every deck and note under it, and
 * leaves scheduling state, the review log and settings exactly as they were.
 *
 * Safe to run on an already-v4 object: it only fills in what is missing,
 * which is also what makes it usable as the repair pass on load.
 */
export function migrateToV4(raw: LegacyDBv3 | DrillDB): DrillDB {
  const src = raw as Partial<DrillDB> & Partial<LegacyDBv3>;

  const projects: Record<string, Project> = { ...(src.projects || {}) };
  let activeProjectId = src.activeProjectId || "";

  /* Reuse the existing default project across repeated runs rather than
     creating a second "General" every load. */
  if (!projects[activeProjectId]) {
    const first = Object.keys(projects)[0];
    if (first) {
      activeProjectId = first;
    } else {
      const p = makeProject(DEFAULT_PROJECT_NAME, {
        blurb: "Everything from before projects existed."
      });
      projects[p.id] = p;
      activeProjectId = p.id;
    }
  }

  const deckSrc = (src.decks || {}) as Record<string, LegacyDeckV3>;
  const decks: Record<string, Deck> = {};
  for (const id of Object.keys(deckSrc)) {
    decks[id] = upgradeDeck(deckSrc[id], activeProjectId);
  }

  /* Rebuild every project's deckIds from the decks themselves, so the two
     never drift apart and a hand-edited backup still lands consistent. */
  for (const pid of Object.keys(projects)) projects[pid].deckIds = [];
  for (const id of Object.keys(decks)) {
    const pid = projects[decks[id].projectId] ? decks[id].projectId : activeProjectId;
    decks[id].projectId = pid;
    projects[pid].deckIds.push(id);
  }

  /* The personal space is created here rather than on demand so that it
     exists before anything can route to it, and so a restored backup from
     before it existed comes back with it. Added after the deckIds rebuild
     above on purpose: it owns no decks, and giving it one is store.heal()'s
     job, which is where the "every project has somewhere to put a card"
     invariant already lives. */
  if (!projects[PERSONAL_PROJECT_ID]) projects[PERSONAL_PROJECT_ID] = makePersonalProject();

  const notes = (src.notes || []).map((n) => upgradeNote(n as LegacyNoteV3, activeProjectId));

  return {
    v: CURRENT_DB_VERSION,
    active: src.active || Object.keys(decks)[0] || "",
    activeProjectId,
    projects,
    settings: (src.settings || {}) as DrillDB["settings"],
    log: Array.isArray(src.log) ? src.log : [],
    notes,
    decks,
    /* A session is a thing about today; carrying a stale one across an upgrade
       would resume a run from whenever the database was last written. */
    session: src.session || null
  };
}
