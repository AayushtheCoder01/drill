/* ============================================================================
 * memoryRetrieval.test.ts — invariants, not examples.
 *
 * These assert the properties the scorer is supposed to have, so a weight
 * change that breaks one is caught before it reaches a browser. Everything
 * here is pure: no DOM, no IndexedDB, no API key. Run with `npm test`.
 *
 * Scoring is time-dependent through recencyDecay, so every case passes an
 * explicit `now` — see the `now` option on retrieve().
 * ========================================================================== */
import test from "node:test";
import assert from "node:assert/strict";
import { DAY } from "@/lib/util";
import { extractKeywords, retrieve, score } from "@/lib/memoryRetrieval";
import type { Memory, MemoryType } from "@/types";

const NOW = Date.UTC(2026, 0, 1);

let seq = 0;
function mem(patch: Partial<Memory> & { text: string }): Memory {
  const text = patch.text;
  return {
    id: patch.id ?? `m${++seq}`,
    scope: patch.scope ?? "project",
    projectId: patch.projectId ?? "p1",
    type: patch.type ?? "understanding",
    text,
    keywords: patch.keywords ?? extractKeywords(text),
    created: patch.created ?? NOW,
    updatedAt: patch.updatedAt ?? NOW,
    useCount: patch.useCount ?? 0,
    lastUsed: patch.lastUsed ?? null,
    pinned: patch.pinned ?? false,
    active: patch.active ?? true,
    supersededBy: patch.supersededBy ?? null,
    source: patch.source ?? "manual",
    origin: patch.origin ?? null
  };
}

/* ------------------------------------------------------------- keywords -- */

test("extractKeywords strips stopwords, punctuation and short words", () => {
  assert.deepEqual(extractKeywords("The gradient of the loss, w.r.t. W!"), ["gradient", "loss"]);
});

test("extractKeywords deduplicates and caps at 40", () => {
  const words = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
  const out = extractKeywords(words + " " + words);
  assert.equal(out.length, 40);
  assert.equal(new Set(out).size, 40);
});

test("extractKeywords survives empty and non-string input", () => {
  assert.deepEqual(extractKeywords(""), []);
  assert.deepEqual(extractKeywords(undefined as unknown as string), []);
});

/* ---------------------------------------------------------------- score -- */

test("score components sum to the reported total", () => {
  const m = mem({ text: "softmax normalises logits into a distribution", useCount: 5, pinned: true });
  const s = score(m, extractKeywords("how does softmax work"), NOW);
  const sum = s.components.keyword + s.components.type + s.components.recency + s.components.usage + s.components.pinned;
  assert.ok(Math.abs(sum - s.score) < 1e-9, `${sum} !== ${s.score}`);
});

test("scoring is deterministic for a fixed now", () => {
  const m = mem({ text: "backprop is the chain rule applied in reverse" });
  const q = extractKeywords("explain backprop");
  assert.deepEqual(score(m, q, NOW), score(m, q, NOW));
});

test("an empty query scores no keyword overlap rather than dividing by zero", () => {
  const s = score(mem({ text: "anything at all here" }), extractKeywords(""), NOW);
  assert.equal(s.components.keyword, 0);
  assert.ok(Number.isFinite(s.score));
});

test("recency decays by half over the stated 60-day half-life", () => {
  const fresh = score(mem({ text: "irrelevant", updatedAt: NOW }), [], NOW);
  const aged = score(mem({ text: "irrelevant", updatedAt: NOW - 60 * DAY }), [], NOW);
  assert.ok(Math.abs(aged.components.recency - fresh.components.recency / 2) < 1e-6);
});

test("a memory updated in the future does not score above a fresh one", () => {
  const fresh = score(mem({ text: "irrelevant", updatedAt: NOW }), [], NOW);
  const future = score(mem({ text: "irrelevant", updatedAt: NOW + 90 * DAY }), [], NOW);
  assert.equal(future.components.recency, fresh.components.recency);
});

test("type weight orders open > goal > convention > understanding > reference", () => {
  const order: MemoryType[] = ["open", "goal", "convention", "understanding", "reference"];
  const weights = order.map((type) => score(mem({ text: "same text everywhere", type }), [], NOW).components.type);
  for (let i = 1; i < weights.length; i++) {
    assert.ok(weights[i] < weights[i - 1], `${order[i]} should rank below ${order[i - 1]}`);
  }
});

test("the usage boost is capped, so a heavily-used memory cannot run away", () => {
  const a = score(mem({ text: "x", useCount: 20 }), [], NOW).components.usage;
  const b = score(mem({ text: "x", useCount: 100_000 }), [], NOW).components.usage;
  assert.equal(a, b);
});

/* ------------------------------------------------------------- retrieve -- */

test("retired memories are never considered, let alone picked", () => {
  const t = retrieve([mem({ text: "retired fact about softmax", active: false })], {
    queryText: "softmax",
    limit: 8,
    now: NOW
  });
  assert.equal(t.considered.length, 0);
  assert.equal(t.picked.length, 0);
});

test("retrieve never returns more than limit", () => {
  const pool = Array.from({ length: 30 }, (_, i) => mem({ text: `fact number ${i} about gradients` }));
  assert.equal(retrieve(pool, { queryText: "gradients", limit: 5, now: NOW }).picked.length, 5);
});

test("considered is sorted by descending score", () => {
  const pool = [
    mem({ text: "unrelated cooking recipe" }),
    mem({ text: "softmax turns logits into probabilities", type: "open" }),
    mem({ text: "softmax is used at the output layer" })
  ];
  const { considered } = retrieve(pool, { queryText: "softmax logits", limit: 8, now: NOW });
  for (let i = 1; i < considered.length; i++) {
    assert.ok(considered[i - 1].score >= considered[i].score);
  }
});

test("the character budget is respected whenever anything fits inside it", () => {
  const maxChars = 200;
  const pool = Array.from({ length: 10 }, (_, i) => mem({ text: `gradient fact ${i} `.repeat(2) }));
  const { picked } = retrieve(pool, { queryText: "gradient", limit: 10, maxChars, now: NOW });
  const total = picked.reduce((n, m) => n + m.text.length, 0);
  assert.ok(picked.length > 1, "several short memories should fit");
  assert.ok(total <= maxChars, `${total} exceeded budget ${maxChars}`);
});

test("one oversized memory never starves the result — the top pick always lands", () => {
  const huge = mem({ text: "gradient ".repeat(2000) });
  const { picked } = retrieve([huge], { queryText: "gradient", limit: 8, maxChars: 100, now: NOW });
  assert.equal(picked.length, 1);
});

test("a smaller lower-ranked memory backfills after an oversized one is skipped", () => {
  const pool = [
    mem({ id: "first", text: "gradient descent steps downhill", type: "open" }),
    mem({ id: "oversized", text: "gradient descent " + "x ".repeat(200), type: "goal" }),
    mem({ id: "backfill", text: "gradient descent needs a learning rate" })
  ];
  const { picked } = retrieve(pool, { queryText: "gradient descent", limit: 8, maxChars: 120, now: NOW });
  assert.deepEqual(picked.map((m) => m.id), ["first", "backfill"]);
});

test("an oversized top hit is stepped over rather than starving everything below it", () => {
  const pool = [
    mem({ id: "big", text: "gradient descent " + "x ".repeat(400), type: "open" }),
    mem({ id: "small", text: "gradient descent steps downhill" })
  ];
  const { picked } = retrieve(pool, { queryText: "gradient descent", limit: 8, maxChars: 120, now: NOW });
  assert.deepEqual(picked.map((m) => m.id), ["small"]);
});

test("a pinned memory does not decay, so age cannot erode the guarantee", () => {
  const fresh = score(mem({ text: "irrelevant", pinned: true, updatedAt: NOW }), [], NOW);
  const ancient = score(mem({ text: "irrelevant", pinned: true, updatedAt: NOW - 3000 * DAY }), [], NOW);
  assert.equal(ancient.components.recency, fresh.components.recency);
  assert.equal(ancient.score, fresh.score);
});

test("pinned outranks a perfectly-matching unpinned memory", () => {
  const pool = [
    mem({ id: "exact", text: "softmax normalises logits", type: "open" }),
    mem({ id: "pinned", text: "the learner prefers derivations before intuition", pinned: true })
  ];
  const { picked } = retrieve(pool, { queryText: "softmax logits", limit: 1, now: NOW });
  assert.equal(picked[0].id, "pinned");
});

test("keyword relevance beats recency for equal types", () => {
  const pool = [
    mem({ id: "stale-hit", text: "the softmax denominator sums over classes", updatedAt: NOW - 200 * DAY }),
    mem({ id: "fresh-miss", text: "the learner reads on the train", updatedAt: NOW })
  ];
  const { picked } = retrieve(pool, { queryText: "softmax denominator classes", limit: 1, now: NOW });
  assert.equal(picked[0].id, "stale-hit");
});

test("an empty pool returns an empty trace rather than throwing", () => {
  const t = retrieve([], { queryText: "anything", limit: 8, now: NOW });
  assert.deepEqual(t.picked, []);
  assert.deepEqual(t.considered, []);
});
