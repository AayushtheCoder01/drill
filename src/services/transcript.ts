/* ============================================================================
 * transcript.ts — the run transcript: what was sent to the model, what came
 * back, tokens, cost, elapsed. For every AI operation, not just chat.
 *
 * In-memory only and capped, on purpose — this is a debugging aid for the
 * current session ("what is it doing"), not a record worth persisting. Every
 * call to services/ai's chat() is wrapped here (see services/ai/index.ts),
 * so nothing that calls through it can go unlogged.
 * ========================================================================== */
import * as U from "@/lib/util";
import type { ChatMessage, TokenUsage } from "@/types";

export interface TranscriptEntry {
  id: string;
  at: number;
  /** "journal" · "distill" · "exam generation" · "exam grading" · "chat" … */
  label: string;
  model: string;
  messages: ChatMessage[];
  response: string | null;
  error: string | null;
  usage?: TokenUsage;
  elapsedMs: number;
}

const MAX = 200;
let items: TranscriptEntry[] = [];
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

export function list(): TranscriptEntry[] {
  return items;
}

export function record(e: Omit<TranscriptEntry, "id">): void {
  items = [{ ...e, id: U.uuid() }, ...items].slice(0, MAX);
  notify();
}

export function clear(): void {
  items = [];
  notify();
}

/** Total prompt+completion tokens and cost across everything still held,
 *  for a one-line "this session so far" readout. */
export function totals(): { calls: number; promptTokens: number; completionTokens: number; cost: number } {
  let promptTokens = 0,
    completionTokens = 0,
    cost = 0;
  for (const e of items) {
    if (!e.usage) continue;
    promptTokens += e.usage.promptTokens || 0;
    completionTokens += e.usage.completionTokens || 0;
    cost += e.usage.cost || 0;
  }
  return { calls: items.length, promptTokens, completionTokens, cost };
}
