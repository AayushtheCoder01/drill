/* ============================================================================
 * logBudget.test.ts — shedding weight must not lose meaning.
 *
 * These exist because the thing being deleted here is the user's history, and
 * the previous version of this logic was one line in gradeCard that threw away
 * two thousand reviews without a word. The rule the tests enforce is the one
 * that makes it safe: everything the activity grid, the streak and the
 * retention figure read must survive shedding untouched. Only the recall text
 * goes, and only where nothing can still read it.
 * ========================================================================== */
import test from "node:test";
import assert from "node:assert/strict";
import { ATTEMPT_WINDOW, LOG_MAX, capLog, pressure, shedAttempts } from "@/lib/logBudget";
import type { LogEntry } from "@/types";

function entry(i: number, withAttempt = false): LogEntry {
  const e: LogEntry = { t: 1_700_000_000_000 + i * 60_000, g: 3, s: "review", d: "deck1", c: "card" + i };
  if (withAttempt) {
    e.a = "x".repeat(260);
    e.v = "got";
  }
  return e;
}

function makeLog(n: number, everyNthHasAttempt = 1): LogEntry[] {
  return Array.from({ length: n }, (_, i) => entry(i, i % everyNthHasAttempt === 0));
}

test("shedding keeps the most recent attempts and drops the rest", () => {
  const log = makeLog(1000);
  const { log: out, shed } = shedAttempts(log, 10);

  assert.equal(shed, 990);
  assert.equal(out.filter((e) => e.a).length, 10);
  /* The ten kept are the ten most recent, not the first ten found. */
  assert.deepEqual(
    out.slice(-10).map((e) => !!e.a),
    Array(10).fill(true)
  );
});

test("shedding never touches what the grid, the streak or retention read", () => {
  const log = makeLog(500);
  const { log: out } = shedAttempts(log, 5);

  assert.equal(out.length, log.length, "an entry must never be removed by shedding");
  for (let i = 0; i < log.length; i++) {
    assert.equal(out[i].t, log[i].t, "the timestamp is the activity grid and the streak");
    assert.equal(out[i].g, log[i].g, "the grade is retention");
    assert.equal(out[i].s, log[i].s, "the state decides what counts as a true review");
    assert.equal(out[i].d, log[i].d, "the deck id is what scopes a log entry to a project");
    assert.equal(out[i].c, log[i].c, "the card id is how a review is traced back");
  }
});

test("the verdict goes with the attempt it was about", () => {
  /* `v` is the marker's opinion of text that is no longer there. Keeping it
     would leave "marked missed" attached to nothing readable. */
  const { log: out } = shedAttempts(makeLog(50), 1);
  const stripped = out.slice(0, -1);
  assert.ok(stripped.every((e) => e.v === undefined));
  assert.ok(out[out.length - 1].v !== undefined);
});

test("counting is by attempts, not by entries", () => {
  /* A spell of reviewing with the recall box off must not push real attempts
     out of the window — the last N *attempts* is the promise, not the
     attempts among the last N entries. */
  const log = [...makeLog(5, 1), ...makeLog(200, 1e9)];
  const { log: out } = shedAttempts(log, 5);
  assert.equal(out.filter((e) => e.a).length, 5, "all five attempts survive 200 later plain entries");
});

test("a log with nothing to shed is returned untouched", () => {
  const log = makeLog(100, 1e9);
  const res = shedAttempts(log);
  assert.equal(res.shed, 0);
  assert.equal(res.log, log, "no allocation when nothing changed");
});

test("shedding is idempotent", () => {
  const once = shedAttempts(makeLog(600), ATTEMPT_WINDOW);
  const twice = shedAttempts(once.log, ATTEMPT_WINDOW);
  assert.equal(twice.shed, 0);
});

test("capping keeps the newest and reports what it forgot", () => {
  const log = makeLog(120);
  const { log: out, dropped } = capLog(log, 100);
  assert.equal(dropped, 20);
  assert.equal(out.length, 100);
  assert.equal(out[0].c, "card20", "the oldest go, never the newest");
  assert.equal(out[99].c, "card119");
});

test("capping under the limit changes nothing and says so", () => {
  const log = makeLog(10);
  const res = capLog(log, LOG_MAX);
  assert.equal(res.dropped, 0);
  assert.equal(res.log, log);
});

test("the shed window is bigger than anything that reads attempts", () => {
  /* lib/dayBrief quotes at most eight attempts, over a day or two. If this
     ever drops near that, shedding starts deleting text the tutor would have
     read. */
  assert.ok(ATTEMPT_WINDOW >= 100, "shed window is too tight to be safe for dayBrief");
});

test("pressure is a fraction, clamped, and honest about not knowing", () => {
  assert.equal(pressure(null), null);
  assert.equal(pressure(0), 0);
  assert.ok((pressure(1024 * 1024) ?? 0) > 0.1);
  assert.equal(pressure(Number.MAX_SAFE_INTEGER), 1, "never reports over 100% full");
});
