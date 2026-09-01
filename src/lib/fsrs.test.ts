/* ============================================================================
 * fsrs.test.ts — a guard on the scheduler, not a reimplementation of it.
 *
 * CONTRIBUTING.md ("Scheduling changes") pins the FSRS-6 weights to the
 * reference release so everyone's scheduling matches out of the box, and asks
 * that the defaults not be changed without an issue first. This turns that
 * social rule into a failing test, and covers the properties a scheduling
 * change is most likely to break by accident.
 *
 * fsrs.ts is pure — no DOM, no storage, no globals — which is exactly why this
 * runs headless in milliseconds. `noFuzz` keeps every interval deterministic.
 * ========================================================================== */
import test from "node:test";
import assert from "node:assert/strict";
import * as F from "@/lib/fsrs";

const NOW = Date.UTC(2026, 0, 1);
const P = F.normParams({ retention: 0.9 });

test("the FSRS-6 weight vector is 21 pinned finite numbers", () => {
  assert.equal(F.DEFAULT_WEIGHTS.length, 21);
  assert.ok(F.DEFAULT_WEIGHTS.every((w) => Number.isFinite(w)));
  // The first four are the initial-stability weights for again/hard/good/easy.
  assert.deepEqual(F.DEFAULT_WEIGHTS.slice(0, 4), [0.212, 1.2931, 2.3065, 8.2956]);
});

test("a wrong-length or non-finite weights override falls back to the defaults", () => {
  assert.deepEqual(F.normParams({ weights: [1, 2, 3] }).weights, F.DEFAULT_WEIGHTS);
  const bad = F.DEFAULT_WEIGHTS.slice();
  bad[5] = NaN;
  assert.deepEqual(F.normParams({ weights: bad }).weights, F.DEFAULT_WEIGHTS);
});

test("a valid 21-number override is honoured", () => {
  const custom = F.DEFAULT_WEIGHTS.map((w) => w + 0.001);
  assert.deepEqual(F.normParams({ weights: custom }).weights, custom);
});

test("retrievability is 1 at zero elapsed days and decreases monotonically", () => {
  assert.ok(Math.abs(F.retrievability(0, 10, P) - 1) < 1e-9);
  let prev = Infinity;
  for (const days of [1, 5, 20, 100, 500]) {
    const r = F.retrievability(days, 10, P);
    assert.ok(r < prev, `R should fall with elapsed time (${days}d)`);
    assert.ok(r > 0 && r <= 1);
    prev = r;
  }
});

test("retrievability at one stability-worth of days sits at target retention", () => {
  // The forgetting curve is calibrated so R(S days) == 0.9 by construction.
  assert.ok(Math.abs(F.retrievability(10, 10, P) - 0.9) < 1e-6);
});

test("a new card takes two Goods to graduate, then grows on every success", () => {
  let s = F.blankState("card-1");
  let now = NOW;

  // First Good sits the card on the 10-minute learning step rather than
  // graduating it: with learningSteps [10], `isNew` holds step at 0.
  s = F.review(s, 3, P, { now, noFuzz: true });
  assert.equal(s.state, "learning");
  assert.equal((s.due - now) / 60000, 10);

  // The second Good graduates it. Stability dips very slightly across that
  // same-day repeat — shortS, not gainS — which is the spacing effect working:
  // ten minutes of elapsed time consolidates nothing.
  const afterFirst = s.S;
  now = s.due;
  s = F.review(s, 3, P, { now, noFuzz: true });
  assert.equal(s.state, "review");
  assert.ok(s.S < afterFirst, "a same-day repeat should not be rewarded like a spaced one");

  // Once in review, real elapsed time means real growth.
  const stabilities: number[] = [];
  for (let i = 0; i < 4; i++) {
    now = s.due;
    s = F.review(s, 3, P, { now, noFuzz: true });
    stabilities.push(s.S);
  }
  for (let i = 1; i < stabilities.length; i++) {
    assert.ok(stabilities[i] > stabilities[i - 1], "spaced success must grow stability");
  }
  assert.equal(s.lapses, 0);
  assert.equal(s.reps, 6);
});

test("a lapse never raises stability and always increments lapses", () => {
  let s = F.blankState("card-2");
  let now = NOW;
  for (let i = 0; i < 4; i++) {
    s = F.review(s, 3, P, { now, noFuzz: true });
    now = s.due;
  }
  const before = s.S;
  const after = F.review(s, 1, P, { now, noFuzz: true });
  assert.ok(after.S <= before, "Again must not increase stability");
  assert.equal(after.lapses, s.lapses + 1);
  assert.equal(after.state, "relearning");
});

test("grades order intervals: again <= hard <= good <= easy", () => {
  let s = F.blankState("card-3");
  let now = NOW;
  for (let i = 0; i < 3; i++) {
    s = F.review(s, 3, P, { now, noFuzz: true });
    now = s.due;
  }
  const dues = ([1, 2, 3, 4] as const).map((g) => F.review(s, g, P, { now, noFuzz: true }).due);
  for (let i = 1; i < dues.length; i++) {
    assert.ok(dues[i] >= dues[i - 1], "a better grade must not schedule sooner");
  }
});

test("difficulty stays inside 1..10 under any grade sequence", () => {
  let s = F.blankState("card-4");
  let now = NOW;
  const grades = [1, 4, 1, 1, 3, 4, 2, 1, 4, 3, 1, 1, 1, 4] as const;
  for (const g of grades) {
    s = F.review(s, g, P, { now, noFuzz: true });
    assert.ok(s.D >= 1 && s.D <= 10, `D out of range: ${s.D}`);
    assert.ok(s.S > 0 && Number.isFinite(s.S), `S out of range: ${s.S}`);
    now = s.due;
  }
});

test("review is pure — the state passed in is never mutated", () => {
  const s = F.blankState("card-5");
  const snapshot = JSON.stringify(s);
  F.review(s, 3, P, { now: NOW, noFuzz: true });
  assert.equal(JSON.stringify(s), snapshot);
});

test("maxInterval caps how far out a card can be scheduled", () => {
  const capped = F.normParams({ retention: 0.9, maxInterval: 30 });
  let s = F.blankState("card-6");
  let now = NOW;
  for (let i = 0; i < 12; i++) {
    s = F.review(s, 4, capped, { now, noFuzz: true });
    const days = (s.due - now) / 86400000;
    assert.ok(days <= 30 + 1e-6, `interval ${days}d exceeded the 30d cap`);
    now = s.due;
  }
});

test("isLeech fires at the configured lapse threshold, not before", () => {
  const p = F.normParams({ leechThreshold: 4 });
  assert.equal(F.isLeech({ ...F.blankState("x"), lapses: 3 }, p), false);
  assert.equal(F.isLeech({ ...F.blankState("x"), lapses: 4 }, p), true);
  assert.equal(F.isLeech(null, p), false);
});

test("previewMinutes on a card in review reads left-to-right", () => {
  let s = F.blankState("card-7");
  let now = NOW;
  for (let i = 0; i < 3; i++) {
    s = F.review(s, 3, P, { now, noFuzz: true });
    now = s.due;
  }
  const preview = F.previewMinutes(s, P, now);
  assert.equal(preview.length, 4);
  for (let i = 1; i < preview.length; i++) {
    assert.ok(preview[i] >= preview[i - 1], `button ${i + 1} scheduled sooner than button ${i}`);
  }
});

/* ODDITY, pinned so a scheduling change has to acknowledge it.
 * On a brand-new card with learningSteps [10], Again and Good both schedule
 * 10 minutes out while Hard schedules 15 — so the ladder reads 10 · 15 · 10 · N
 * and pressing Hard delays you *more* than pressing Good. It follows from
 * `isNew` holding step at 0 (fsrs.ts:200-206) so the first Good cannot
 * graduate. CONTRIBUTING.md asks for an issue before changing scheduling
 * defaults, so this asserts the behaviour rather than fixing it. */
test("oddity: on a new card Hard schedules further out than Good", () => {
  const [again, hard, good, easy] = F.previewMinutes(F.blankState("card-8"), P, NOW);
  assert.equal(again, 10);
  assert.equal(hard, 15);
  assert.equal(good, 10);
  assert.ok(easy > hard, "Easy should still graduate the card");
});
