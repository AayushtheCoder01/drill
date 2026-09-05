/* ============================================================================
 * memoryStore.ts — what the assistant is told about the learner: CRUD,
 * persistence, and the subscription React binds to.
 *
 * Shape mirrors chatStore.ts (module singleton + sync cache over IndexedDB)
 * for the same reason: the chat composer needs to read scored memory
 * synchronously while it types a system prompt, not after an await.
 * ========================================================================== */
import * as U from "@/lib/util";
import { extractKeywords } from "@/lib/memoryRetrieval";
import { idbAll, idbDelete, idbPut, STORE_MEM } from "./idb";
import type { Memory, MemoryOrigin, MemoryScope, MemorySource, MemoryType } from "@/types";

let items: Memory[] = [];
let loaded = false;
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
export function isLoaded(): boolean {
  return loaded;
}

export async function init(): Promise<void> {
  if (loaded) return;
  return reload();
}

/** Re-reads IndexedDB unconditionally — used after a backup restore, which
 *  writes the store directly and leaves this module's cache stale. */
export async function reload(): Promise<void> {
  try {
    items = await idbAll<Memory>(STORE_MEM);
  } catch (e) {
    console.error("could not load memory", e);
    items = [];
  }
  loaded = true;
  notify();
}

/** Write a memory whose *content* changed. `updatedAt` is the fact's own
 *  clock — when this thing last became true or was corrected — and retrieval
 *  decays against it, so only a real edit is allowed to move it. */
function persistChanged(m: Memory): void {
  m.updatedAt = Date.now();
  persistOnly(m);
}

/** Write a memory whose content did not change — usage telemetry, pinning,
 *  retiring. Deliberately leaves `updatedAt` alone: bumping it here is what
 *  made retrieval self-reinforcing, since a memory that got injected then
 *  scored higher on *both* recency and usage next time, and the top few never
 *  rotated out. See lib/memoryRetrieval.ts. */
function persistOnly(m: Memory): void {
  void idbPut(STORE_MEM, m).catch((e) => console.error("memory save failed", e));
  notify();
}

/**
 * One topic slug, or null.
 *
 * Normalised hard on the way in because a topic is only useful if two
 * memories about the same subject land on the *same string* — "Backprop",
 * "backprop " and "back-prop" grouping into three headings is the failure
 * mode that makes people stop filing things.
 */
export function normTopic(raw: string | null | undefined): string | null {
  const t = String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40);
  return t || null;
}

/* ------------------------------------------------------------------ reads */

export function all(): Memory[] {
  return items;
}

/** Every topic in use, with how many active memories sit under each, most
 *  populated first. This is what lets the memory panel be a structure rather
 *  than a list. */
export function topics(opts: { projectId?: string | null } = {}): { topic: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const m of items) {
    if (!m.active || !m.topic) continue;
    if (opts.projectId !== undefined && m.scope === "project" && m.projectId !== opts.projectId) continue;
    counts.set(m.topic, (counts.get(m.topic) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic));
}

export function get(id: string): Memory | undefined {
  return items.find((m) => m.id === id);
}

export interface ListOpts {
  scope?: MemoryScope;
  projectId?: string | null;
  type?: MemoryType;
  activeOnly?: boolean;
}

export function list(opts: ListOpts = {}): Memory[] {
  return items
    .filter((m) => {
      if (opts.scope && m.scope !== opts.scope) return false;
      if (opts.projectId !== undefined && m.projectId !== opts.projectId) return false;
      if (opts.type && m.type !== opts.type) return false;
      if (opts.activeOnly && !m.active) return false;
      return true;
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/* -------------------------------------------------------------- mutation */

export interface CreateInput {
  scope: MemoryScope;
  projectId: string | null;
  type: MemoryType;
  text: string;
  source: MemorySource;
  origin?: MemoryOrigin | null;
  pinned?: boolean;
  /** The subject slug this files under. Null is normal — most memory is
   *  unfiled, and a wrong topic is worse than none. */
  topic?: string | null;
}

export function create(input: CreateInput): Memory {
  const now = Date.now();
  const m: Memory = {
    id: U.uuid(),
    scope: input.scope,
    projectId: input.scope === "global" ? null : input.projectId,
    type: input.type,
    text: input.text.trim(),
    keywords: extractKeywords(input.text),
    topic: normTopic(input.topic),
    links: [],
    created: now,
    updatedAt: now,
    useCount: 0,
    lastUsed: null,
    pinned: !!input.pinned,
    active: true,
    supersededBy: null,
    source: input.source,
    origin: input.origin || null
  };
  items.push(m);
  persistChanged(m);
  return m;
}

export function update(id: string, patch: { text?: string; type?: MemoryType; topic?: string | null }): void {
  const m = get(id);
  if (!m) return;
  if (patch.text !== undefined) {
    m.text = patch.text.trim();
    m.keywords = extractKeywords(m.text);
  }
  if (patch.type !== undefined) m.type = patch.type;
  if (patch.topic !== undefined) m.topic = normTopic(patch.topic);
  persistChanged(m);
}

export function setPinned(id: string, pinned: boolean): void {
  const m = get(id);
  if (!m) return;
  m.pinned = pinned;
  persistOnly(m);
}

/** Why a retire call did nothing, so a caller can report honestly instead of
 *  counting a change that never happened. */
export type RetireResult = "retired" | "unknown-id" | "pinned" | "already-retired";

/** Soft-delete. `supersededBy` links to whatever replaced it, when known —
 *  never a hard delete, so a bad consolidation stays recoverable.
 *
 *  Refuses to retire a pinned memory unless forced. `pinned` is documented as
 *  "never retired by consolidation" (types/core.ts) and until now nothing
 *  enforced it: an AI-proposed rollup could name a pinned id and, if the
 *  learner did not spot that line, retire it for good. */
export function retire(id: string, supersededBy: string | null = null, opts?: { force?: boolean }): RetireResult {
  const m = get(id);
  if (!m) return "unknown-id";
  if (!m.active) return "already-retired";
  if (m.pinned && !opts?.force) return "pinned";
  m.active = false;
  m.supersededBy = supersededBy;
  persistOnly(m);
  return "retired";
}

export function restore(id: string): void {
  const m = get(id);
  if (!m) return;
  m.active = true;
  m.supersededBy = null;
  persistOnly(m);
}

/** Rare — used only to undo an accidental manual add. Consolidation always
 *  retires, it never calls this. */
export function remove(id: string): void {
  items = items.filter((m) => m.id !== id);
  void idbDelete(STORE_MEM, id).catch(() => undefined);
  notify();
}

/** Injection telemetry: called once per memory actually sent to the model,
 *  not on every render that merely previews context size. */
export function recordUsage(id: string): void {
  const m = get(id);
  if (!m) return;
  m.useCount += 1;
  m.lastUsed = Date.now();
  persistOnly(m);
}
