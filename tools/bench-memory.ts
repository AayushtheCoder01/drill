/* ============================================================================
 * bench-memory.ts — how good is memory retrieval, as a number.
 *
 * `npm run bench:memory`
 *
 * The scorer in lib/memoryRetrieval.ts has five weighted terms, a decay curve
 * and a greedy budget loop. Tuning that by feel is how retrieval systems rot:
 * every change looks like an improvement on the one example you had in mind.
 * This runs a fixed corpus of memories against a fixed set of queries with
 * human-chosen expected answers, and prints precision, recall and MRR.
 *
 * It is a bench, not a test — it always exits 0. The number is the point: take
 * a baseline before changing scoring, and compare after. Deterministic, free,
 * offline, no API key.
 *
 * Add cases by editing tools/fixtures/memory-eval.json. Sampling real queries
 * out of the run transcript and pasting them in is the intended way to grow it.
 * ========================================================================== */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { DAY } from "../src/lib/util.ts";
import { extractKeywords, retrieve } from "../src/lib/memoryRetrieval.ts";
import type { Memory, MemoryScope, MemoryType } from "../src/types.ts";

/** A fixed clock, so recency decay is reproducible run to run. */
const NOW = Date.UTC(2026, 0, 1);
const DEFAULT_PROJECT = "p1";
const LIMIT = 5;

interface MemoryRow {
  id: string;
  scope: MemoryScope;
  projectId?: string;
  type: MemoryType;
  text: string;
  ageDays: number;
  useCount?: number;
  pinned?: boolean;
}

interface QueryRow {
  q: string;
  expect: string[];
  projectId?: string;
  limit?: number;
}

interface Fixture {
  memories: MemoryRow[];
  queries: QueryRow[];
}

function hydrate(r: MemoryRow): Memory {
  const at = NOW - r.ageDays * DAY;
  return {
    id: r.id,
    scope: r.scope,
    projectId: r.scope === "global" ? null : r.projectId || DEFAULT_PROJECT,
    type: r.type,
    text: r.text,
    keywords: extractKeywords(r.text),
    created: at,
    updatedAt: at,
    useCount: r.useCount || 0,
    lastUsed: null,
    pinned: !!r.pinned,
    active: true,
    supersededBy: null,
    source: "manual",
    origin: null
  };
}

/** The same scoping rule chatContext.memoriesForSource applies for
 *  `scope: "both"` — global memory plus this project's. */
function poolFor(all: Memory[], projectId: string): Memory[] {
  return all.filter((m) => m.scope === "global" || m.projectId === projectId);
}

/* ---------------------------------------------------------------- metrics */

/** Of what we returned, how much was wanted. */
function precision(picked: string[], expected: string[]): number {
  if (!picked.length) return 0;
  return picked.filter((id) => expected.includes(id)).length / picked.length;
}

/** Of what was wanted, how much we returned. The one that matters most here:
 *  a memory that should have been in the prompt and was not is the failure
 *  the learner actually feels. */
function recall(picked: string[], expected: string[]): number {
  if (!expected.length) return 1;
  return expected.filter((id) => picked.includes(id)).length / expected.length;
}

/** 1/rank of the first wanted item — how near the top the best answer landed. */
function reciprocalRank(picked: string[], expected: string[]): number {
  const i = picked.findIndex((id) => expected.includes(id));
  return i < 0 ? 0 : 1 / (i + 1);
}

function pct(n: number): string {
  return (n * 100).toFixed(1).padStart(5) + "%";
}

/* ------------------------------------------------------------------- run */

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(here, "fixtures", "memory-eval.json"), "utf8")) as Fixture;
const all = fixture.memories.map(hydrate);

console.log(`\nmemory retrieval bench — ${all.length} memories, ${fixture.queries.length} queries, top ${LIMIT}\n`);

let sumP = 0;
let sumR = 0;
let sumMRR = 0;
const misses: string[] = [];

for (const query of fixture.queries) {
  const projectId = query.projectId || DEFAULT_PROJECT;
  const limit = query.limit || LIMIT;
  const pool = poolFor(all, projectId);
  const trace = retrieve(pool, { queryText: query.q, limit, now: NOW });
  const picked = trace.picked.map((m) => m.id);

  /* Pinned memory is always injected by contract, so it occupies a slot on
     every query by design. Counting it as a false positive would punish the
     scorer for obeying its own rule, so it joins the expected set instead. */
  const expected = [...new Set([...query.expect, ...pool.filter((m) => m.pinned).map((m) => m.id)])];

  const p = precision(picked, expected);
  const r = recall(picked, query.expect);
  const rr = reciprocalRank(picked, query.expect);
  sumP += p;
  sumR += r;
  sumMRR += rr;

  const missed = query.expect.filter((id) => !picked.includes(id));
  const flag = missed.length ? "MISS" : "  ok";
  console.log(`${flag}  P ${pct(p)}  R ${pct(r)}  RR ${rr.toFixed(2)}   ${query.q}`);
  console.log(`        got: ${picked.join(", ") || "(nothing)"}`);
  if (missed.length) {
    console.log(`        missed: ${missed.join(", ")}`);
    misses.push(query.q);
  }
}

const n = fixture.queries.length;
console.log("\n" + "-".repeat(72));
console.log(`precision@${LIMIT}  ${pct(sumP / n)}     of what it returned, how much was wanted`);
console.log(`recall@${LIMIT}     ${pct(sumR / n)}     of what was wanted, how much it returned`);
console.log(`MRR          ${(sumMRR / n).toFixed(3)}      how near the top the first right answer landed`);
console.log(`clean        ${n - misses.length}/${n}       queries that missed nothing`);
console.log("-".repeat(72) + "\n");

if (misses.length) {
  console.log("queries still missing something:");
  for (const q of misses) console.log(`  · ${q}`);
  console.log("");
}

/* --------------------------------------------------------------- drift ---
 *
 * The static numbers above score a corpus nobody has used yet, so they cannot
 * see the failure mode that actually degrades memory over months: retrieval
 * feeding its own inputs. Every injected memory gets recordUsage(), which
 * raises its usage score — and used to also reset `updatedAt`, restarting its
 * 60-day recency decay. A memory that got picked therefore scored higher next
 * time on two terms at once, and the same few entries won forever.
 *
 * This replays the whole query set for several rounds, applying usage the way
 * the store does, and counts how much of the corpus ever surfaces. The
 * `alsoTouchUpdatedAt` variant reproduces the old behaviour for comparison.
 */
function drift(rounds: number, alsoTouchUpdatedAt: boolean): { reached: number; settled: number } {
  const corpus = fixture.memories.map(hydrate);
  const byId = new Map(corpus.map((m) => [m.id, m]));
  const everPicked = new Set<string>();
  let lastRoundPicks = "";
  let settled = rounds;

  for (let round = 0; round < rounds; round++) {
    const thisRound: string[] = [];
    for (const query of fixture.queries) {
      const pool = poolFor(corpus, query.projectId || DEFAULT_PROJECT);
      const trace = retrieve(pool, { queryText: query.q, limit: query.limit || LIMIT, now: NOW });
      for (const m of trace.picked) {
        everPicked.add(m.id);
        thisRound.push(m.id);
        const live = byId.get(m.id)!;
        live.useCount += 1;
        live.lastUsed = NOW;
        if (alsoTouchUpdatedAt) live.updatedAt = NOW;
      }
    }
    const key = thisRound.join("|");
    if (key === lastRoundPicks && settled === rounds) settled = round;
    lastRoundPicks = key;
  }
  return { reached: everPicked.size / corpus.length, settled };
}

const ROUNDS = 25;
const fixed = drift(ROUNDS, false);
const old = drift(ROUNDS, true);

console.log(`usage drift over ${ROUNDS} rounds of the full query set`);
console.log(`  corpus reached, updatedAt left alone   ${pct(fixed.reached)}   (round it stopped changing: ${fixed.settled})`);
console.log(`  corpus reached, usage bumps updatedAt  ${pct(old.reached)}   (round it stopped changing: ${old.settled})`);
console.log(
  fixed.reached > old.reached
    ? "  → separating the fact's clock from the read clock keeps more of memory reachable.\n"
    : "  → no measurable difference on this corpus.\n"
);
