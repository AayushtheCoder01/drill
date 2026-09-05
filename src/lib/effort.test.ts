/* ============================================================================
 * effort.test.ts — what the dial actually promises.
 *
 * These exist because the composer showed two chips that both read as cost
 * dials, and one of them described a budget the other had switched off: the
 * effort tooltip said "up to three lookups" while the thread was set to
 * Direct, which makes none. Pure: no DOM, no stores.
 * ========================================================================== */
import test from "node:test";
import assert from "node:assert/strict";
import { EFFORT_BUDGETS, EFFORT_ORDER, budgetFor, deepSteps, effortMeans } from "@/lib/effort";

test("no effort blurb claims lookups on its own", () => {
  /* The blurb is shown in every mode, so anything it says has to be true in
     every mode. The lookup sentence is the chip's job, because the chip is the
     only thing that knows which mode is selected. */
  for (const e of EFFORT_ORDER) {
    assert.doesNotMatch(EFFORT_BUDGETS[e].blurb, /lookup/i, `${e} blurb mentions lookups`);
  }
});

test("direct mode says plainly that there are no lookups", () => {
  for (const e of EFFORT_ORDER) {
    const s = effortMeans(e, "direct");
    assert.match(s, /no lookups/i);
    assert.doesNotMatch(s, /up to \d+/, `${e} promised a lookup budget in direct mode`);
  }
});

test("agent and deep quote the budget the loop is actually given", () => {
  for (const e of EFFORT_ORDER) {
    const b = budgetFor(e);
    assert.match(effortMeans(e, "agent"), new RegExp(`up to ${b.agentSteps},`));
    assert.match(effortMeans(e, "deep"), new RegExp(`up to ${deepSteps(b.agentSteps)},`));
  }
});

test("deep always buys more rounds than agent, at every effort", () => {
  /* Writing and closing a plan costs rounds. If deep ever had the same budget
     as agent it would spend most of it on bookkeeping and answer worse. */
  for (const e of EFFORT_ORDER) {
    const n = budgetFor(e).agentSteps;
    assert.ok(deepSteps(n) > n + 1, `deep at ${e} is not meaningfully bigger`);
  }
});

test("low effort still allows one lookup", () => {
  /* Zero would make "cheap" mean "cannot check anything", which is the
     difference between an answer and "I have no way of knowing what you
     studied". */
  assert.ok(budgetFor("low").agentSteps >= 1);
});
