/* ============================================================================
 * candidates.ts — the memory staging tray.
 *
 * Nothing here is memory yet. Distill and the weekly rollup propose; the
 * learner accepts or rejects one at a time or in bulk. Accepting creates the
 * real Memory row (via memoryStore) and removes the candidate; rejecting
 * just removes it. Nothing lingers once actioned — this is a tray, not a log.
 * ========================================================================== */
import * as U from "@/lib/util";
import * as memoryStore from "./memoryStore";
import { idbAll, idbDelete, idbPut, STORE_CAND } from "./idb";
import type { Memory, MemoryCandidate, MemoryOrigin, MemoryScope, MemoryType } from "@/types";

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
  supersedes?: string | null;
}

export function propose(drafts: ProposeInput[]): MemoryCandidate[] {
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
        supersedes: d.supersedes || null,
        status: "pending"
      })
    );
  items.push(...made);
  for (const c of made) void idbPut(STORE_CAND, c).catch(() => undefined);
  if (made.length) notify();
  return made;
}

function drop(id: string): void {
  items = items.filter((c) => c.id !== id);
  void idbDelete(STORE_CAND, id).catch(() => undefined);
}

/** Commits the candidate as real memory, retiring whatever it supersedes,
 *  then removes it from the tray. `edits` lets the review UI change the text
 *  or type before committing without a separate save step. */
export function accept(id: string, edits?: { text?: string; type?: MemoryType }): Memory | null {
  const c = items.find((x) => x.id === id);
  if (!c) return null;
  const m = memoryStore.create({
    scope: c.scope,
    projectId: c.projectId,
    type: edits?.type ?? c.type,
    text: (edits?.text ?? c.text).trim(),
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
