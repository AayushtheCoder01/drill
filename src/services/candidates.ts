/* ============================================================================
 * candidates.ts — the memory staging tray.
 *
 * Nothing here is memory yet. Distill and the weekly rollup propose; the
 * learner accepts or rejects one at a time or in bulk. Accepting creates the
 * real Memory row (via memoryStore) and removes the candidate; rejecting
 * just removes it. Nothing lingers once actioned — this is a tray, not a log.
 * ========================================================================== */
import * as U from "@/lib/util";
import * as store from "./store";
import * as memoryStore from "./memoryStore";
import { idbAll, idbDelete, idbPut, STORE_CAND } from "./idb";
import * as persistence from "./persistence";
import type { Autonomy, Memory, MemoryCandidate, MemoryOrigin, MemoryScope, MemoryType } from "@/types";

let items: MemoryCandidate[] = [];
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

export async function init(): Promise<void> {
  if (loaded) return;
  return reload();
}

export async function reload(): Promise<void> {
  try {
    items = await idbAll<MemoryCandidate>(STORE_CAND);
  } catch (e) {
    console.error("could not load candidates", e);
    items = [];
  }
  loaded = true;
  notify();
}

export function all(): MemoryCandidate[] {
  return items;
}
export function pending(projectId?: string): MemoryCandidate[] {
  return items.filter((c) => c.status === "pending" && (projectId === undefined || c.projectId === projectId || c.scope === "global"));
}

export interface ProposeInput {
  scope: MemoryScope;
  projectId: string | null;
  type: MemoryType;
  text: string;
  origin?: MemoryOrigin | null;
  /** Subject slug, carried to the Memory this becomes. */
  topic?: string | null;
  supersedes?: string | null;
  /** True when the learner said this outright and the model only transcribed
   *  it. Under "assisted" autonomy these commit without review. */
  stated?: boolean;
}

/**
 * How freely a proposal is allowed to commit itself, resolved for the project
 * it belongs to. Project policy beats the global default; both were editable,
 * persisted and read by nothing until now.
 *
 *   manual    everything waits in the tray, always
 *   assisted  the default — things the learner *stated* commit directly,
 *             things the model inferred wait to be looked at
 *   auto      everything commits, tray stays empty
 */
function autonomyFor(projectId: string | null): Autonomy {
  const project = projectId ? store.projects()[projectId] : null;
  return project?.memoryPolicy?.autonomy || store.settings().autonomy || "assisted";
}

/**
 * `stated` marks a draft the learner said outright and the model only
 * transcribed. That is the one kind trusted to save itself under "assisted",
 * because there is nothing to second-guess: they said it.
 */
export interface ProposeResult {
  /** Committed straight to memory by the autonomy policy. */
  committed: Memory[];
  /** Waiting in the tray to be looked at. */
  queued: MemoryCandidate[];
}

export function propose(drafts: ProposeInput[]): ProposeResult {
  const direct: MemoryCandidate[] = [];
  const made = drafts
    .filter((d) => d.text && d.text.trim())
    .map(
      (d): MemoryCandidate => ({
        id: U.uuid(),
        scope: d.scope,
        projectId: d.scope === "global" ? null : d.projectId,
        type: d.type,
        text: d.text.trim(),
        createdAt: Date.now(),
        origin: d.origin || null,
        topic: memoryStore.normTopic(d.topic),
        supersedes: d.supersedes || null,
        stated: !!d.stated,
        status: "pending"
      })
    );
  /* Split by policy rather than pushing everything into the tray. A tray you
     have to empty by hand after every distil is the hassle "auto" exists to
     remove — and under "manual" nothing should ever commit behind your back. */
  const queued: MemoryCandidate[] = [];
  for (const c of made) {
    const mode = autonomyFor(c.projectId);
    const commits = mode === "auto" || (mode === "assisted" && c.stated);
    if (commits) direct.push(c);
    else queued.push(c);
  }

  const committed: Memory[] = [];
  for (const c of direct) {
    committed.push(
      memoryStore.create({
        scope: c.scope,
        projectId: c.projectId,
        type: c.type,
        text: c.text,
        topic: c.topic,
        source: c.stated ? "stated" : "proposed",
        origin: c.origin
      })
    );
  }

  items.push(...queued);
  for (const c of queued) void persistence.guard("memory candidate", idbPut(STORE_CAND, c));
  if (made.length) notify();
  return { committed, queued };
}

function drop(id: string): void {
  items = items.filter((c) => c.id !== id);
  void persistence.guard("memory candidate", idbDelete(STORE_CAND, id));
}

/** Commits the candidate as real memory, retiring whatever it supersedes,
 *  then removes it from the tray. `edits` lets the review UI change the text
 *  or type before committing without a separate save step. */
export function accept(id: string, edits?: { text?: string; type?: MemoryType; topic?: string | null }): Memory | null {
  const c = items.find((x) => x.id === id);
  if (!c) return null;
  const m = memoryStore.create({
    scope: c.scope,
    projectId: c.projectId,
    type: edits?.type ?? c.type,
    text: (edits?.text ?? c.text).trim(),
    topic: edits?.topic !== undefined ? edits.topic : c.topic,
    source: "proposed",
    origin: c.origin
  });
  if (c.supersedes) memoryStore.retire(c.supersedes, m.id);
  drop(id);
  notify();
  return m;
}

export function reject(id: string): void {
  if (!items.some((c) => c.id === id)) return;
  drop(id);
  notify();
}

export function acceptAll(ids: string[]): Memory[] {
  const made: Memory[] = [];
  for (const id of ids) {
    const m = accept(id);
    if (m) made.push(m);
  }
  return made;
}

export function rejectAll(ids: string[]): void {
  for (const id of ids) drop(id);
  if (ids.length) notify();
}
