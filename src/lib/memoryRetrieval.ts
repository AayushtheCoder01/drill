/* ============================================================================
 * memoryRetrieval.ts — keyword + recency + usage scoring for memory.
 *
 * No embeddings (a locked decision, see START-HERE.md §2.3): keyword overlap
 * plus recency decay plus a usage boost is exact, free, and explainable — the
 * RetrievalTrace this produces is literally "why was this picked", shown in
 * the memory panel rather than left as a black box.
 * ========================================================================== */
import { DAY } from "@/lib/util";
import type { Memory, MemoryType } from "@/types";

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "for", "is", "are", "was", "were", "be", "been",
  "being", "this", "that", "these", "those", "it", "its", "with", "as", "at", "by", "from", "i", "you", "your",
  "my", "me", "we", "our", "not", "no", "do", "does", "did", "have", "has", "had", "so", "if", "then", "than",
  "which", "what", "how", "why", "when", "who", "will", "would", "could", "should", "can", "just", "about",
  "into", "out", "up", "down", "over", "under", "again", "there", "here", "all", "some", "any", "very"
]);

/** Lowercased, punctuation-stripped, stopword- and short-word-filtered,
 *  deduplicated. The retrieval scorer's main input on both sides. */
export function extractKeywords(text: string): string[] {
  const words = String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  return Array.from(new Set(words)).slice(0, 40);
}

/** open/goal/convention rank high — these are the entries worth resurfacing
 *  unprompted; profile/reference are useful but passive. */
const TYPE_WEIGHT: Record<MemoryType, number> = {
  open: 1.0,
  goal: 0.95,
  convention: 0.85,
  understanding: 0.6,
  preference: 0.55,
  profile: 0.5,
  reference: 0.4
};

const HALF_LIFE_DAYS = 60;

function keywordOverlap(queryWords: string[], memKeywords: string[]): number {
  if (!queryWords.length || !memKeywords.length) return 0;
  const set = new Set(memKeywords);
  const hits = queryWords.filter((w) => set.has(w)).length;
  return hits / queryWords.length;
}

function recencyDecay(updatedAt: number, now: number): number {
  const days = Math.max(0, (now - updatedAt) / DAY);
  return Math.pow(0.5, days / HALF_LIFE_DAYS);
}

export interface ScoreComponents {
  keyword: number;
  type: number;
  recency: number;
  usage: number;
  pinned: number;
}

export interface ScoredMemory {
  memory: Memory;
  score: number;
  components: ScoreComponents;
}

export function score(m: Memory, queryWords: string[], now = Date.now()): ScoredMemory {
  const components: ScoreComponents = {
    keyword: keywordOverlap(queryWords, m.keywords) * 3.0,
    type: (TYPE_WEIGHT[m.type] ?? 0.5) * 1.5,
    /* Pinned memory is documented as "never decayed" (types/core.ts), so it
       does not age. Until now that guarantee only held by accident — the +10
       bonus happens to exceed the 7.0 ceiling of the other four terms — which
       meant any reweighting could silently break it. */
    recency: (m.pinned ? 1 : recencyDecay(m.updatedAt, now)) * 1.0,
    usage: Math.min(Math.log1p(m.useCount), 3) * 0.5,
    pinned: m.pinned ? 10.0 : 0
  };
  const s = components.keyword + components.type + components.recency + components.usage + components.pinned;
  return { memory: m, score: s, components };
}

export interface RetrievalTrace {
  queryWords: string[];
  /** Every candidate considered, scored, sorted highest first. */
  considered: ScoredMemory[];
  /** The ones that made it inside the limit and the character budget. */
  picked: Memory[];
  maxChars: number;
}

/** Score every candidate against `queryText`, then take the top `limit`
 *  within a character budget so one long memory can't crowd out the rest.
 *
 *  `now` is injectable so the bench and the tests can score against a fixed
 *  clock — recency decay otherwise makes every assertion time-dependent. */
export function retrieve(
  candidates: Memory[],
  opts: { queryText: string; limit: number; maxChars?: number; now?: number }
): RetrievalTrace {
  const queryWords = extractKeywords(opts.queryText);
  const now = opts.now ?? Date.now();
  const maxChars = opts.maxChars ?? 3500;
  const considered = candidates
    .filter((m) => m.active)
    .map((m) => score(m, queryWords, now))
    .sort((a, b) => b.score - a.score);

  /* Admit in score order, anything that still fits. A memory too long for the
     remaining budget is skipped rather than ending the loop, so smaller
     lower-ranked ones can backfill behind it — that is what stops one very
     long memory crowding out the rest, which is the whole reason the budget
     exists. */
  const picked: Memory[] = [];
  let chars = 0;
  for (const c of considered) {
    if (picked.length >= opts.limit) break;
    if (chars + c.memory.text.length > maxChars) continue;
    picked.push(c.memory);
    chars += c.memory.text.length;
  }

  /* Unless nothing fit at all. A single memory longer than the whole budget
     would otherwise return an empty context block, which is worse than an
     oversized one — the learner asked a question and the model was told
     nothing. */
  if (!picked.length && considered.length) picked.push(considered[0].memory);

  return { queryWords, considered, picked, maxChars };
}
