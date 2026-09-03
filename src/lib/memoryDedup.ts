/* ============================================================================
 * memoryDedup.ts — the guard against a junk drawer.
 *
 * Dedup used to be entirely model-side: the extraction prompt was handed a
 * list of what was already captured and asked nicely not to repeat it. That
 * works until it doesn't, and nothing downstream checked. Saving from chat
 * makes it far easier to save the same thing five times, so the check moves
 * into code.
 *
 * Keyword Jaccard, using memoryRetrieval's `extractKeywords` so both sides
 * agree on what a word is — retrieval and dedup disagreeing about tokenisation
 * would be its own quiet bug.
 *
 * A near-match becomes a `supersedes` merge rather than a second row, which
 * is what finally gives `MemoryCandidate.supersedes` a producer and makes
 * CandidateTray's "replaces existing" badge reachable.
 * ========================================================================== */
import { extractKeywords } from "@/lib/memoryRetrieval";
import type { Memory } from "@/types";

/** Same text, said twice. Dropped outright. */
const DUPLICATE = 0.72;
/** Same subject, restated or refined. Offered as a replacement. */
const MERGE = 0.42;

/** START-HERE §6: global memory is capped at ~25 active entries and
 *  consolidated aggressively. Nothing enforced it until now. */
export const GLOBAL_CAP = 25;

export type DedupKind = "new" | "duplicate" | "merge";

/** Anything with text worth comparing against — a committed `Memory`, but
 *  also a candidate still sitting in the tray, which is not a Memory yet and
 *  must still not be proposed twice. */
export interface DedupTarget {
  id: string;
  text: string;
  keywords?: string[];
  active?: boolean;
}

export interface DedupVerdict<T extends DedupTarget = Memory> {
  kind: DedupKind;
  /** The closest existing entry, when there was one worth naming. */
  existing: T | null;
  similarity: number;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / (a.size + b.size - shared);
}

/**
 * Where a proposed memory sits against what is already known.
 *
 * Compared against the whole pool rather than the retrieved set: a duplicate
 * that scores badly against the current query is still a duplicate.
 */
export function classify<T extends DedupTarget>(text: string, pool: T[]): DedupVerdict<T> {
  const words = new Set(extractKeywords(text));
  let best: T | null = null;
  let bestSim = 0;

  for (const m of pool) {
    /* Candidates carry no `active` flag; absent means live. */
    if (m.active === false) continue;
    /* Prefer the memory's stored keywords, which were extracted at write time
       with this same tokeniser; fall back for rows written before that. */
    const other = new Set(m.keywords?.length ? m.keywords : extractKeywords(m.text));
    const sim = jaccard(words, other);
    if (sim > bestSim) {
      bestSim = sim;
      best = m;
    }
  }

  if (bestSim >= DUPLICATE) return { kind: "duplicate", existing: best, similarity: bestSim };
  if (bestSim >= MERGE) return { kind: "merge", existing: best, similarity: bestSim };
  return { kind: "new", existing: null, similarity: bestSim };
}

/** True when the global scope is at or over its cap, so the caller can say so
 *  rather than quietly making the drawer worse. */
export function globalAtCap(pool: Memory[]): boolean {
  return pool.filter((m) => m.active && m.scope === "global").length >= GLOBAL_CAP;
}
