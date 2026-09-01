/* ============================================================================
 * cardGate.ts — the local half of the card quality gate.
 *
 * Atomicity, self-containment and recall-vs-recognition are enforced inside
 * the distill prompt itself (the model rewrites a card that fails them
 * rather than the app trying to detect prose quality after the fact — see
 * START-HERE.md §4 Stage 3). Duplicate detection is different: it is exact,
 * free, and wrong to spend a call on, so it runs here, locally, both before
 * the call (fed to the model as "already covered") and after (to grey out
 * anything that still slipped through).
 * ========================================================================== */
import { stripTags } from "@/lib/util";
import type { Card } from "@/types";

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "is", "are", "was", "were", "what", "why",
  "how", "does", "do", "with", "as", "it", "this", "that", "you", "your"
]);

function wordSet(text: string): Set<string> {
  const words = stripTags(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  return new Set(words);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let hits = 0;
  for (const w of a) if (b.has(w)) hits++;
  const union = a.size + b.size - hits;
  return union ? hits / union : 0;
}

/** Above this, two cards are treated as asking the same thing. Tuned loose
 *  on purpose — a false "maybe a duplicate" costs one glance; a missed one
 *  costs a card nobody ever sees a difference between. */
const THRESHOLD = 0.5;

export interface DuplicateMatch {
  card: Card;
  existing: Card;
  score: number;
}

/** The best match for one candidate front, if any clears the threshold. */
export function findDuplicate(candidate: Pick<Card, "q">, existing: Card[]): DuplicateMatch | null {
  const cw = wordSet(candidate.q);
  let best: DuplicateMatch | null = null;
  for (const e of existing) {
    const score = jaccard(cw, wordSet(e.q));
    if (score >= THRESHOLD && (!best || score > best.score)) {
      best = { card: candidate as Card, existing: e, score };
    }
  }
  return best;
}

/** Runs findDuplicate over a whole proposal batch. Returned map keys are
 *  indices into `candidates`, so the caller can grey the matching entries
 *  without needing every card to have a stable id yet. */
export function findDuplicates(candidates: Pick<Card, "q">[], existing: Card[]): Map<number, DuplicateMatch> {
  const out = new Map<number, DuplicateMatch>();
  candidates.forEach((c, i) => {
    const hit = findDuplicate(c, existing);
    if (hit) out.set(i, hit);
  });
  return out;
}
