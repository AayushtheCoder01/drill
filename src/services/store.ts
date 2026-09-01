/* ============================================================================
 * store.ts — everything Drill knows, and how it survives a restart.
 *
 * A module-level singleton (not a React context) so the review loop, panes
 * and keyboard shortcuts can all read/write it without prop-drilling — the
 * same shape the original db.js had. React components subscribe to it with
 * the useDrillStore hook (src/hooks/useDrillStore.ts) via useSyncExternalStore.
 *
 * One JSON blob, persisted through storage.ts:
 *   { v:3, active:<deckId>, settings:{...}, log:[...], notes:[...],
 *     decks: { <deckId>: { id, name, created, cards:[...], srs:{}, meta:{} } } }
 * ========================================================================== */
import * as U from "@/lib/util";
import * as FSRS from "@/lib/fsrs";
import * as CFG from "@/lib/config";
import * as storage from "./storage";
import * as migrate from "@/lib/migrate";
import { SEED_DECK } from "@/lib/seed";
import { normaliseCardHtml } from "@/lib/cardFormat";
import type {
  Card,
  Deck,
  DeckMeta,
  DrillConfig,
  DrillDB,
  FSRSParams,
  Grade,
  ImportPayload,
  LegacyDBv2,
  LegacyDBv3,
  LegacyDeckV2,
  Note,
  NoteSource,
  Project,
  QueueItem,
  Session,
  Settings,
  SRSState,
  ValidateResult
} from "@/types";

const MIN = U.MIN;
const DAY = U.DAY;

export const DEFAULT_TUTOR =
  "You are a sharp, terse tutor. The learner prefers mental models over step-by-step walkthroughs and " +
  "prefers to struggle before being handed an answer. Give the shortest explanation that actually changes " +
  "how they see the thing, use a concrete example or a limiting case, and end with one probing question " +
  "they have to answer themselves. No praise, no filler, no restating the question. Reply in plain HTML " +
  "using only <p>, <strong>, <em>, <code>.";

/** Settings that live in the browser. Anything left empty falls through to
 *  config.json / config.local.json at the point of use — see services/ai. */
export const DEFAULT_SETTINGS: Settings = {
  backend: "",
  key: "",
  model: "",
  baseUrl: "",
  newPerDay: 10,
  tutor: DEFAULT_TUTOR,
  lang: "english",
  retention: 0.9,
  maxIvl: 365,
  recall: true,
  mark: true,
  mix: false,
  interleave: true,
  effort: "medium",
  autonomy: "assisted",
  theme: "night",
  accent: "blue",
  density: "comfortable",
  navCollapsed: false,
  textScale: 1,
  sessionSize: 10
};

let db: DrillDB = null as unknown as DrillDB;
let version = 0;
const listeners = new Set<() => void>();

function notify() {
  version++;
  listeners.forEach((l) => l());
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function getVersion(): number {
  return version;
}

/* ---------- shape helpers ---------- */
function blankMeta(): DeckMeta {
  return { newToday: 0, dayKey: U.today(), streak: 0, lastActive: null, reviews: 0 };
}

/**
 * The one funnel every card passes through — generated, distilled, imported,
 * hand-edited or migrated.
 *
 * `clean` strips anything scripty; `normaliseCardHtml` then puts whatever the
 * model actually wrote into the house format, because a model asked for HTML
 * will still hand back markdown fences, backticks and \(...\) delimiters. Doing
 * it here rather than at each call site is what makes it true of every card
 * rather than only the ones written by the surface someone remembered to fix.
 */
export function normCard(c: Partial<Card> | null | undefined): Card {
  const out: Card = {
    id: (c && c.id) || U.uid("c"),
    tag: String((c && c.tag) || "General").slice(0, 44),
    q: normaliseCardHtml(U.clean(c && c.q)),
    a: normaliseCardHtml(U.clean(c && c.a))
  };
  if (c && c.sourceRef) out.sourceRef = c.sourceRef;
  return out;
}

/** Card ids are kept when they come in from a file, so re-importing an
 *  updated deck lands on the same scheduling rows. Within one deck they still
 *  have to be unique, though — a collision would make two cards share a
 *  review history — so a repeat gets a fresh id. */
function dedupeIds(existing: Card[] | undefined, cards: Partial<Card>[]): Card[] {
  const seen: Record<string, boolean> = {};
  (existing || []).forEach((c) => (seen[c.id] = true));
  return cards.map((c) => {
    const n = normCard(c);
    if (seen[n.id]) n.id = U.uid("c");
    seen[n.id] = true;
    return n;
  });
}

export function makeDeck(name: string, cards?: Partial<Card>[], projectId?: string): Deck {
  return {
    id: U.uid("d"),
    name: String(name || "New deck").slice(0, 60),
    created: Date.now(),
    projectId: projectId || "",
    cards: dedupeIds([], cards || []),
    srs: {},
    meta: blankMeta()
  };
}

function normLang(v: unknown): "english" | "hinglish" {
  if (!v) return "english";
  const s = String(v).toLowerCase();
  if (s === "hinglish" || s === "hi-en" || s === "hinglish-en") return "hinglish";
  return "english";
}

/* ---------- persistence ---------- */
let saveTimer: ReturnType<typeof setTimeout> | null = null;
export function save(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 90);
}
export function saveNow(): void {
  if (saveTimer) clearTimeout(saveTimer);
  try {
    storage.write(JSON.stringify(db));
  } catch (e) {
    // toast wiring happens in the UI layer; surface via console as a fallback
    console.error("Save failed", e);
  }
}

export function get(): DrillDB {
  return db;
}
export function deck(): Deck {
  return db.decks[db.active];
}
export function settings(): Settings {
  return db.settings;
}

/** The one place Settings gets mutated. Every settings screen should call
 *  this rather than assigning into settings() directly and calling saveNow()
 *  itself — that older pattern saved to disk but never called notify(), so
 *  callers had to fake their own re-render with a local setTick counter. */
export function updateSettings(patch: Partial<Settings>): void {
  Object.assign(db.settings, patch);
  saveNow();
  notify();
}

export function params(): Partial<FSRSParams> {
  return CFG.fsrsParams(db.settings);
}

export function stateOf(d: Deck, id: string): SRSState {
  return d.srs[id] || FSRS.blankState(id);
}
export function isLeech(st: SRSState | null | undefined): boolean {
  return FSRS.isLeech(st, params());
}
export function currentInterval(st: SRSState | null | undefined): number {
  return FSRS.currentIntervalMinutes(st, params());
}

/* ---------- migration ---------- */
/** v2 stored SM-2: one ease factor and an interval in minutes. FSRS wants
 *  stability in days and difficulty on 1..10, so the interval becomes the
 *  opening stability estimate and the ease factor is mapped onto difficulty
 *  (ease 2.5 -> D 5, higher ease -> easier card -> lower D). */
export function migrateV2(o: LegacyDBv2): LegacyDBv3 {
  const st = o.settings || {};
  const n: LegacyDBv3 = {
    v: 3,
    active: o.active,
    decks: {},
    settings: {
      ...DEFAULT_SETTINGS,
      key: (st.key as string) || "",
      model: (st.model as string) || "",
      newPerDay: (st.newPerDay as number) || 10,
      tutor: (st.tutor as string) || DEFAULT_TUTOR
    },
    log: [],
    notes: []
  };
  for (const id of Object.keys(o.decks || {})) {
    const d: LegacyDeckV2 = o.decks[id];
    const nd: LegacyDBv3["decks"][string] = {
      id: d.id,
      name: d.name,
      created: d.created,
      cards: (d.cards || []).map(normCard),
      srs: {},
      meta: d.meta || blankMeta()
    };
    for (const cid of Object.keys(d.srs || {})) {
      const s = (d.srs || {})[cid] || {};
      const days = Math.max(0.1, (s.ivl || 10) / 1440);
      nd.srs[cid] = {
        id: cid,
        state: s.stage === "review" ? "review" : s.stage === "learning" ? "learning" : "new",
        step: 0,
        S: days,
        D: U.clamp(13 - 3.2 * (s.ease || 2.5), 1, 10),
        due: s.due || Date.now(),
        reps: s.reps || 1,
        lapses: s.lapses || 0,
        last: (s.due || Date.now()) - (s.ivl || 10) * MIN
      };
    }
    n.decks[d.id] = nd;
  }
  if (!n.decks[n.active]) n.active = Object.keys(n.decks)[0];
  return n;
}

/** A database as it came off disk, plus the bytes it came from — the caller
 *  needs the original text to write a pre-migration backup. */
interface LoadedRaw {
  data: LegacyDBv3 | DrillDB;
  /** The exact string read from storage, or null when it was rebuilt from v2. */
  text: string | null;
}

function loadRaw(): LoadedRaw | null {
  try {
    const r = storage.readCurrent();
    if (r) {
      const d = JSON.parse(r) as DrillDB;
      if (d && d.decks && Object.keys(d.decks).length) return { data: d, text: r };
    }
  } catch {
    /* corrupt or unavailable storage falls through to v2 / fresh */
  }
  try {
    const r2 = storage.readLegacy();
    if (r2) {
      const d2 = JSON.parse(r2) as LegacyDBv2;
      if (d2 && d2.decks && Object.keys(d2.decks).length) {
        /* The v2 key is never overwritten, so it is its own backup. */
        return { data: migrateV2(d2), text: null };
      }
    }
  } catch {
    /* same */
  }
  return null;
}

function freshDB(cfg?: DrillConfig): DrillDB {
  const seed = SEED_DECK || { name: "New deck", cards: [] };
  const project = migrate.makeProject(migrate.DEFAULT_PROJECT_NAME, {
    blurb: "Your first project. Rename it, or add another."
  });
  const d = makeDeck(seed.name, seed.cards, project.id);
  project.deckIds.push(d.id);
  const o: DrillDB = {
    v: migrate.CURRENT_DB_VERSION,
    active: d.id,
    activeProjectId: project.id,
    projects: { [project.id]: project },
    decks: {},
    settings: { ...DEFAULT_SETTINGS },
    log: [],
    notes: [],
    session: null
  };
  o.decks[d.id] = d;
  applyConfigDefaults(o, cfg);
  return o;
}

/** config.json supplies the *starting* values for the handful of settings the
 *  UI also owns. Once a database exists these are not re-applied, otherwise
 *  editing them in Settings would never stick. */
function applyConfigDefaults(target: DrillDB, cfg?: DrillConfig): void {
  const ui = (cfg && cfg.ui) || ({} as DrillConfig["ui"]);
  if (ui.retentionTarget != null) target.settings.retention = ui.retentionTarget;
  if (ui.newPerDay != null) target.settings.newPerDay = ui.newPerDay;
  if (ui.language != null) target.settings.lang = normLang(ui.language);
  const f = (cfg && cfg.fsrs) || ({} as DrillConfig["fsrs"]);
  if (f.maxInterval != null) target.settings.maxIvl = f.maxInterval;
}

/** What init() did, for the UI to report once after an upgrade. */
export interface InitReport {
  fresh: boolean;
  /** The version found on disk, before anything was changed. */
  fromVersion: number;
  migrated: boolean;
  /** True when the pre-migration bytes were safely stashed. */
  backedUp: boolean;
}

let lastInit: InitReport = { fresh: true, fromVersion: 0, migrated: false, backedUp: false };

export function initReport(): InitReport {
  return lastInit;
}

/**
 * Read storage, upgrade it if it predates this build, repair anything
 * missing, and make it the live database. Takes the resolved config so a
 * first run can honour config.json defaults.
 *
 * The v3 -> v4 upgrade writes the untouched original to a separate key first.
 * migrateToV4 is idempotent, so it doubles as the repair pass that fills in
 * fields on a database written by an older v4 build.
 */
export function init(cfg?: DrillConfig): DrillDB {
  const loaded = loadRaw();
  const fresh = !loaded;
  const fromVersion = loaded ? migrate.dbVersionOf(loaded.data) : 0;
  const willMigrate = !!loaded && migrate.needsUpgrade(loaded.data);

  let backedUp = false;
  if (willMigrate && loaded && loaded.text) backedUp = storage.writeBackupOnce(loaded.text);

  db = loaded ? migrate.migrateToV4(loaded.data) : freshDB(cfg);
  lastInit = { fresh, fromVersion, migrated: willMigrate, backedUp };

  db.settings = { ...DEFAULT_SETTINGS, ...(db.settings || {}) };
  db.settings.lang = normLang(db.settings.lang);
  if (!Array.isArray(db.log)) db.log = [];
  if (!Array.isArray(db.notes)) db.notes = [];

  for (const id of Object.keys(db.decks)) {
    const d = db.decks[id];
    if (!d.srs) d.srs = {};
    if (!d.meta) d.meta = blankMeta();
    if (!Array.isArray(d.cards)) d.cards = [];
    /* Rows written by the pre-FSRS build get their stability filled in. */
    for (const k of Object.keys(d.srs)) {
      const s = d.srs[k] as SRSState & { ivl?: number; ease?: number; stage?: string };
      if ((s as unknown as { S?: number }).S === undefined) {
        const days = Math.max(0.1, (s.ivl || 10) / 1440);
        s.S = days;
        s.D = U.clamp(13 - 3.2 * (s.ease || 2.5), 1, 10);
        s.state = s.stage === "review" ? "review" : s.stage === "learning" ? "learning" : "new";
        s.step = 0;
        s.last = (s.due || Date.now()) - (s.ivl || 10) * MIN;
        s.reps = s.reps || 1;
      }
    }
  }
  /* Keep the active project pointing somewhere real; migrateToV4 guarantees
     at least one project exists. Resolved before db.active so the deck
     fallback below can stay inside it — otherwise a dangling db.active could
     heal onto a deck from a *different* project than db.activeProjectId. */
  if (!db.projects[db.activeProjectId]) db.activeProjectId = Object.keys(db.projects)[0];
  if (!db.decks[db.active] || db.decks[db.active].projectId !== db.activeProjectId) {
    const inProject = decksOf(db.activeProjectId);
    db.active = inProject.length ? inProject[0].id : Object.keys(db.decks)[0];
  }
  saveNow();
  notify();
  return db;
}

/* ---------- projects ---------- */
/* Full CRUD lives in services/projects.ts; these are the reads the review
   loop and the deck operations below need without importing it. */

export function projects(): Record<string, Project> {
  return db.projects;
}

export function activeProject(): Project {
  return db.projects[db.activeProjectId];
}

export function projectOf(d: Deck): Project | undefined {
  return db.projects[d.projectId];
}

/** Decks belonging to a project, in insertion order. */
export function decksOf(projectId: string): Deck[] {
  return Object.keys(db.decks)
    .map((id) => db.decks[id])
    .filter((d) => d.projectId === projectId);
}

/** Move a deck between projects, keeping both deckIds lists honest. */
export function setDeckProject(deckId: string, projectId: string): void {
  const d = db.decks[deckId];
  if (!d || !db.projects[projectId] || d.projectId === projectId) return;
  const from = db.projects[d.projectId];
  if (from) from.deckIds = from.deckIds.filter((x) => x !== deckId);
  d.projectId = projectId;
  const to = db.projects[projectId];
  if (!to.deckIds.includes(deckId)) to.deckIds.push(deckId);
  to.updated = Date.now();
  saveNow();
  notify();
}

export function createProject(name: string, opts?: { blurb?: string; goals?: string }): Project {
  const p = migrate.makeProject(name, opts);
  db.projects[p.id] = p;
  saveNow();
  notify();
  return p;
}

export function renameProject(id: string, name: string): void {
  const p = db.projects[id];
  if (!p) return;
  p.name = String(name).trim().slice(0, 60) || p.name;
  p.updated = Date.now();
  saveNow();
  notify();
}

export function updateProject(id: string, patch: { blurb?: string; goals?: string }): void {
  const p = db.projects[id];
  if (!p) return;
  if (patch.blurb !== undefined) p.blurb = patch.blurb;
  if (patch.goals !== undefined) p.goals = patch.goals;
  p.updated = Date.now();
  saveNow();
  notify();
}

export function updateProjectDefaults(id: string, patch: Partial<Project["defaults"]>): void {
  const p = db.projects[id];
  if (!p) return;
  Object.assign(p.defaults, patch);
  p.updated = Date.now();
  saveNow();
  notify();
}

export function updateMemoryPolicy(id: string, patch: Partial<Project["memoryPolicy"]>): void {
  const p = db.projects[id];
  if (!p) return;
  Object.assign(p.memoryPolicy, patch);
  p.updated = Date.now();
  saveNow();
  notify();
}

/* ---------- project knowledge ---------- */
/* Content is inlined at add time — there is no server to re-fetch it from,
   see types/core.ts's KnowledgeItem doc comment. */

export function addKnowledge(projectId: string, name: string, kind: "file" | "text" | "link", text: string): void {
  const p = db.projects[projectId];
  if (!p) return;
  p.knowledge.push({ id: U.uuid(), name: name.slice(0, 80), kind, text, size: text.length, addedAt: Date.now(), enabled: true });
  p.updated = Date.now();
  saveNow();
  notify();
}

export function removeKnowledge(projectId: string, id: string): void {
  const p = db.projects[projectId];
  if (!p) return;
  p.knowledge = p.knowledge.filter((k) => k.id !== id);
  p.updated = Date.now();
  saveNow();
  notify();
}

export function setKnowledgeEnabled(projectId: string, id: string, enabled: boolean): void {
  const p = db.projects[projectId];
  if (!p) return;
  const k = p.knowledge.find((x) => x.id === id);
  if (!k) return;
  k.enabled = enabled;
  saveNow();
  notify();
}

/** Archives (or restores) a project without touching what it owns — decks,
 *  notes and conversations stay exactly where they are, so unarchiving is a
 *  full undo. Refuses to archive the last unarchived project. */
export function archiveProject(id: string, archived: boolean): void {
  const p = db.projects[id];
  if (!p || p.archived === archived) return;
  if (archived) {
    const others = Object.values(db.projects).filter((x) => x.id !== id && !x.archived);
    if (!others.length) return;
  }
  p.archived = archived;
  p.updated = Date.now();
  saveNow();
  notify();
}

/**
 * Makes a project the active one. The review loop always needs a deck to
 * show, so a project with none gets a starter deck the same way a freshly
 * emptied deck list does in deleteDeck.
 */
export function setActiveProject(id: string): void {
  if (!db.projects[id] || db.activeProjectId === id) return;
  db.activeProjectId = id;
  let decks = decksOf(id);
  if (!decks.length) {
    const d = makeDeck("New deck", [], id);
    db.decks[d.id] = d;
    db.projects[id].deckIds.push(d.id);
    decks = [d];
  }
  if (!decks.some((x) => x.id === db.active)) db.active = decks[0].id;
  db.settings.mix = false;
  saveNow();
  notify();
}

/* ---------- deck operations ---------- */
export function addDeck(name: string, cards?: Partial<Card>[], makeActive?: boolean, projectId?: string): Deck {
  const pid = projectId && db.projects[projectId] ? projectId : db.activeProjectId;
  const d = makeDeck(name, cards, pid);
  db.decks[d.id] = d;
  db.projects[pid].deckIds.push(d.id);
  if (makeActive !== false) {
    db.active = d.id;
    db.settings.mix = false;
  }
  saveNow();
  notify();
  return d;
}

export function deleteDeck(id: string): void {
  const owner = db.decks[id] && db.projects[db.decks[id].projectId];
  if (owner) owner.deckIds = owner.deckIds.filter((x) => x !== id);
  delete db.decks[id];
  if (db.active === id) {
    // Stay inside the active project — falling back to Object.keys(db.decks)[0]
    // could land db.active on a deck belonging to a different project.
    const remaining = decksOf(db.activeProjectId);
    db.active = remaining.length ? remaining[0].id : "";
  }
  if (!db.active) {
    addDeck("New deck", []);
    return;
  }
  saveNow();
  notify();
}

export function renameDeck(id: string, name: string): void {
  if (db.decks[id]) {
    db.decks[id].name = String(name).slice(0, 60);
    saveNow();
    notify();
  }
}

export function setActive(id: string): void {
  if (!db.decks[id]) return;
  db.active = id;
  db.settings.mix = false;
  saveNow();
  notify();
}

export function addCards(d: Deck, cards: Partial<Card>[]): void {
  d.cards = d.cards.concat(dedupeIds(d.cards, cards));
  saveNow();
  notify();
}

export function upsertCard(d: Deck, card: Partial<Card>): Card {
  const nc = normCard(card);
  const i = d.cards.findIndex((x) => x.id === nc.id);
  if (i >= 0) d.cards[i] = nc;
  else d.cards.push(nc);
  saveNow();
  notify();
  return nc;
}

export function deleteCard(d: Deck, id: string): void {
  d.cards = d.cards.filter((x) => x.id !== id);
  delete d.srs[id];
  saveNow();
  notify();
}

export function replaceCard(d: Deck, oldId: string, replacements: Partial<Card>[]): void {
  d.cards = d.cards.filter((x) => x.id !== oldId);
  delete d.srs[oldId];
  d.cards = d.cards.concat(dedupeIds(d.cards, replacements));
  saveNow();
  notify();
}

export function resetProgress(d: Deck): void {
  d.srs = {};
  d.meta = blankMeta();
  saveNow();
  notify();
}

/* ---------- the queue ---------- */
/** Which decks are in play: just the active one, or every deck in the active
 *  project when the learner has turned mixing on. Scoped to the project —
 *  otherwise "mix all decks" would pull in another project's cards, which is
 *  exactly the leak projects exist to prevent. */
export function pool(): Deck[] {
  const ids = Object.keys(db.decks).filter((id) => db.decks[id].projectId === db.activeProjectId);
  return db.settings.mix && ids.length > 1 ? ids.map((id) => db.decks[id]) : [deck()];
}

/** New-cards-today counters reset at local midnight; the streak advances only
 *  if yesterday was actually worked. */
export function rollover(): void {
  for (const d of pool()) {
    const m = d.meta;
    if (m.dayKey !== U.today()) {
      if (m.lastActive === U.yesterdayKey()) m.streak += 1;
      else if (m.lastActive !== U.today()) m.streak = m.lastActive ? 1 : 0;
      m.dayKey = U.today();
      m.newToday = 0;
    }
  }
}

export interface Counts {
  due: number;
  unseen: number;
  newLeft: number;
}

export function counts(): Counts {
  const now = Date.now();
  let due = 0,
    unseen = 0,
    newLeft = 0;
  const p = pool();
  for (const d of p) {
    let un = 0;
    for (const c of d.cards) {
      const s = d.srs[c.id];
      if (!s || !s.reps) un++;
      else if (s.due <= now) due++;
    }
    unseen += un;
    newLeft += Math.min(un, Math.max(0, (db.settings.newPerDay || 10) - d.meta.newToday));
  }
  return { due, unseen, newLeft };
}

/**
 * Pick the next card. Due cards first (oldest due first), then new cards up
 * to the daily cap, then anything in a learning step landing soon.
 *
 * Interleaving: when the oldest-due card shares a section with the one just
 * answered, look a little way down the queue for a different section. The
 * window is deliberately small (8) so it shuffles neighbours rather than
 * abandoning due order.
 */
export function nextCard(lastTag: string): QueueItem | null {
  const now = Date.now();
  const decks = pool();
  const dues: QueueItem[] = [];
  for (const d of decks) {
    for (const c of d.cards) {
      const s = d.srs[c.id];
      if (s && s.reps && s.due <= now) dues.push({ deck: d, def: c, st: s });
    }
  }
  if (dues.length) {
    dues.sort((a, b) => a.st.due - b.st.due);
    if (db.settings.interleave && dues.length > 1) {
      const alt = dues.find((x) => x.def.tag !== lastTag);
      if (alt && dues.indexOf(alt) < 8) return alt;
    }
    return dues[0];
  }

  const cap = db.settings.newPerDay || 10;
  const hungry = decks.filter(
    (d) => d.meta.newToday < cap && d.cards.some((c) => !d.srs[c.id] || !d.srs[c.id].reps)
  );
  if (hungry.length) {
    hungry.sort((a, b) => a.meta.newToday - b.meta.newToday);
    const hd = hungry[0];
    const nc = hd.cards.find((c) => !hd.srs[c.id] || !hd.srs[c.id].reps);
    if (nc) return { deck: hd, def: nc, st: stateOf(hd, nc.id) };
  }

  let soon: QueueItem | null = null;
  for (const dk of decks) {
    for (const cc of dk.cards) {
      const ss = dk.srs[cc.id];
      if (
        ss &&
        (ss.state === "learning" || ss.state === "relearning") &&
        ss.due <= now + 20 * MIN &&
        (!soon || ss.due < soon.st.due)
      ) {
        soon = { deck: dk, def: cc, st: ss };
      }
    }
  }
  return soon;
}

export function nextDue(): string | null {
  const now = Date.now();
  let soonest: number | null = null;
  for (const d of pool()) {
    for (const c of d.cards) {
      const s = d.srs[c.id];
      if (s && s.reps && s.due > now && (soonest === null || s.due < soonest)) soonest = s.due;
    }
  }
  return soonest ? U.fmt((soonest - now) / MIN) : null;
}

/** Record a grade. Returns the new scheduling state. */
export function gradeCard(o: QueueItem, g: Grade): SRSState {
  const d = o.deck;
  const before = o.st.state || "new";
  if (!d.srs[o.def.id] || !d.srs[o.def.id].reps) d.meta.newToday += 1;
  d.srs[o.def.id] = FSRS.review(o.st, g, params(), { now: Date.now() });
  d.meta.reviews += 1;
  d.meta.lastActive = U.today();
  if (d.meta.streak === 0) d.meta.streak = 1;
  db.log.push({ t: Date.now(), g, s: before, d: d.id });
  if (db.log.length > 8000) db.log = db.log.slice(-6000);
  const live = session();
  if (live) live.done += 1;
  save();
  notify();
  return d.srs[o.def.id];
}

/* ---------- the day's session ---------- */

/**
 * Today's session for the active project, or null.
 *
 * Expiry is read-time rather than a rollover job: a session is only live if
 * its day and project still match, so yesterday's run simply stops counting
 * without anything having to run at midnight.
 */
export function session(): Session | null {
  const s = db.session;
  if (!s) return null;
  if (s.day !== U.today() || s.projectId !== db.activeProjectId) return null;
  return s;
}

/** Start a run of `target` cards, or resume today's if one is already going —
 *  reloading mid-session must not reset the count. Asking for a different
 *  size on the same day re-targets without losing progress. */
export function startSession(target?: number): Session {
  const size = Math.max(1, Math.round(target ?? db.settings.sessionSize ?? 10));
  const live = session();
  if (live) {
    live.target = size;
  } else {
    db.session = { day: U.today(), projectId: db.activeProjectId, target: size, done: 0, startedAt: Date.now() };
  }
  saveNow();
  notify();
  return db.session!;
}

/** Clear the finish line. The queue is untouched — ending a session only
 *  stops the counting, it never stops you reviewing. */
export function endSession(): void {
  db.session = null;
  saveNow();
  notify();
}

/** Cards left in today's run, or null when none is going. */
export function sessionLeft(): number | null {
  const s = session();
  return s ? Math.max(0, s.target - s.done) : null;
}

/* ---------- statistics ---------- */
export interface Stats {
  rev: number;
  ok: number;
  last7: number;
  today: number;
  fc: number[];
  bands: number[];
  cards: number;
  seen: number;
  leech: number;
}

/** True retention counts only cards that were already in the review state —
 *  grading a card you are still learning says nothing about your memory. */
export function stats(): Stats {
  const now = Date.now();
  const cut = now - 30 * DAY;
  let rev = 0,
    ok = 0,
    last7 = 0,
    todayN = 0;
  const midnight = new Date().setHours(0, 0, 0, 0);
  for (const e of db.log) {
    if (e.t >= cut && e.s === "review") {
      rev++;
      if (e.g > 1) ok++;
    }
    if (e.t >= now - 7 * DAY) last7++;
    if (e.t >= midnight) todayN++;
  }
  const fc = [0, 0, 0, 0, 0, 0, 0];
  const bands = [0, 0, 0, 0, 0];
  let cards = 0,
    seen = 0,
    leech = 0;
  for (const d of pool()) {
    cards += d.cards.length;
    for (const c of d.cards) {
      const s = d.srs[c.id];
      if (!s || !s.reps) continue;
      seen++;
      if (isLeech(s)) leech++;
      const days = s.S;
      bands[days < 1 ? 0 : days < 7 ? 1 : days < 21 ? 2 : days < 90 ? 3 : 4]++;
      const idx = Math.floor((s.due - now) / DAY);
      if (idx >= 0 && idx < 7) fc[idx]++;
      else if (idx < 0) fc[0]++;
    }
  }
  return { rev, ok, last7, today: todayN, fc, bands, cards, seen, leech };
}

/* ---------- import / export ---------- */
/** Check a payload without committing it, so the Import pane can show what is
 *  wrong with card 7 instead of just refusing. */
export function validateCards(list: unknown): ValidateResult {
  const ok: Card[] = [];
  const problems: string[] = [];
  if (!Array.isArray(list)) return { ok, problems: ["Expected a JSON array of cards."] };
  list.forEach((c: unknown, i: number) => {
    const where = "card " + (i + 1);
    if (!c || typeof c !== "object") {
      problems.push(where + ": not an object");
      return;
    }
    const rec = c as Record<string, unknown>;
    if (!rec.q || !String(rec.q).trim()) {
      problems.push(where + ': missing "q" (the front)');
      return;
    }
    if (!rec.a || !String(rec.a).trim()) {
      problems.push(where + ': missing "a" (the back)');
      return;
    }
    if (!rec.tag) problems.push(where + ': no "tag", filed under General');
    ok.push(normCard({ id: rec.id as string, tag: rec.tag as string, q: rec.q as string, a: rec.a as string }));
  });
  return { ok, problems };
}

/** Accepts a bare card array, a {name, cards} deck, or a full backup.
 *  Returns {kind:"cards"|"backup", ...}; the caller decides what to do. */
export function readPayload(txt: string): ImportPayload {
  let j: unknown;
  try {
    j = JSON.parse(txt);
  } catch (e) {
    throw new Error("That is not valid JSON (" + (e as Error).message + ")");
  }

  if (Array.isArray(j)) return { kind: "cards", name: null, cards: j };
  if (j && typeof j === "object" && Array.isArray((j as Record<string, unknown>).cards)) {
    const rec = j as Record<string, unknown>;
    return { kind: "cards", name: (rec.name as string) || null, cards: rec.cards as unknown[] };
  }
  if (j && typeof j === "object" && (j as Record<string, unknown>).decks && typeof (j as Record<string, unknown>).decks === "object") {
    return { kind: "backup", data: j as DrillDB | LegacyDBv2 };
  }
  throw new Error("Expected a deck ({name, cards}), a list of cards, or a full backup.");
}

/** Accepts a backup from any version this build knows: v2 goes through the
 *  SM-2 conversion first, v3 and older-v4 through migrateToV4, and a current
 *  v4 blob through migrateToV4's repair path. */
export function restoreBackup(raw: DrillDB | LegacyDBv3 | LegacyDBv2): void {
  const v = migrate.dbVersionOf(raw);
  const asV3 = v <= 2 ? migrateV2(raw as LegacyDBv2) : (raw as LegacyDBv3 | DrillDB);
  db = migrate.migrateToV4(asV3);
  db.settings = { ...DEFAULT_SETTINGS, ...(db.settings || {}) };
  db.settings.lang = normLang(db.settings.lang);
  if (!Array.isArray(db.log)) db.log = [];
  if (!Array.isArray(db.notes)) db.notes = [];
  if (!db.projects[db.activeProjectId]) db.activeProjectId = Object.keys(db.projects)[0];
  if (!db.decks[db.active] || db.decks[db.active].projectId !== db.activeProjectId) {
    const inProject = decksOf(db.activeProjectId);
    db.active = inProject.length ? inProject[0].id : Object.keys(db.decks)[0];
  }
  saveNow();
  notify();
}

export function exportDeck(d: Deck): string {
  return JSON.stringify({ name: d.name, cards: d.cards }, null, 1);
}
export function exportAll(): string {
  return JSON.stringify(db, null, 1);
}

/* ---------- notes ---------- */

export interface AddNoteOpts {
  /** Defaults to the active project. */
  projectId?: string;
  /** How it got here. Capture-sourced notes are reviewed before this runs. */
  source?: NoteSource;
  attachments?: Note["attachments"];
}

export function addNote(text: string, tag: string, opts: AddNoteOpts = {}): Note {
  if (!Array.isArray(db.notes)) db.notes = [];
  const n: Note = {
    id: U.uuid(),
    projectId: opts.projectId && db.projects[opts.projectId] ? opts.projectId : db.activeProjectId,
    t: Date.now(),
    text,
    tag,
    source: opts.source || "manual",
    memoryId: null,
    attachments: opts.attachments || []
  };
  db.notes.push(n);
  saveNow();
  notify();
  return n;
}

export function deleteNote(id: string): void {
  db.notes = (db.notes || []).filter((n: Note) => n.id !== id);
  saveNow();
  notify();
}

/** Notes for one project, newest last (the order they were written). */
export function notesOf(projectId: string): Note[] {
  return (db.notes || []).filter((n) => n.projectId === projectId);
}

/** Called after a note is promoted, so the panel can show the link. */
export function linkNoteMemory(noteId: string, memoryId: string | null): void {
  const n = (db.notes || []).find((x) => x.id === noteId);
  if (!n) return;
  n.memoryId = memoryId;
  saveNow();
  notify();
}
