/* ============================================================================
 * storage.test.ts — telling "the drawer is full" from "storage is switched
 * off", because the two need different answers.
 *
 * A quota failure is recoverable: shed weight, write again. A blocked one
 * never is, so retrying it burns the main thread on every keystroke and still
 * loses the work. saveNow() branches on this, and it branches on error names
 * that three browser engines spell three different ways — which is exactly
 * the sort of thing that is right when written and wrong two releases later.
 * ========================================================================== */
import test from "node:test";
import assert from "node:assert/strict";
import { classifyWriteError } from "@/services/storage";

/** DOMException is not constructible with a code in node, and the point is
 *  that this reads plain shapes anyway — it has to survive whatever a browser
 *  actually throws, including things that are not DOMExceptions at all. */
function err(name: string, code?: number): unknown {
  return Object.assign(new Error(name), { name, code });
}

test("every browser's spelling of a full drawer is a quota failure", () => {
  /* Chrome and Safari throw QuotaExceededError with legacy code 22; Firefox
     throws NS_ERROR_DOM_QUOTA_REACHED with code 1014. All three are the same
     condition and all three are recoverable by shedding weight. */
  assert.equal(classifyWriteError(err("QuotaExceededError", 22)), "quota");
  assert.equal(classifyWriteError(err("NS_ERROR_DOM_QUOTA_REACHED", 1014)), "quota");
  assert.equal(classifyWriteError(err("SomethingElse", 22)), "quota", "the legacy code alone is enough");
  assert.equal(classifyWriteError(err("SomethingElse", 1014)), "quota");
  assert.equal(classifyWriteError(err("QuotaExceededError")), "quota", "the name alone is enough");
});

test("storage being switched off is not a quota failure", () => {
  /* A private window, third-party storage blocked, or a locked-down profile.
     Shedding the review log would give up history and still not write. */
  assert.equal(classifyWriteError(err("SecurityError")), "blocked");
  assert.equal(classifyWriteError(err("InvalidAccessError")), "blocked");
  assert.equal(classifyWriteError(err("TypeError")), "blocked");
});

test("anything unrecognised is reported, never assumed away", () => {
  /* The one answer that must never be silently "fine": an unknown failure is
     still a failure, and the alarm has to go up either way. */
  assert.equal(classifyWriteError(err("WeirdError")), "unknown");
  assert.equal(classifyWriteError(null), "unknown");
  assert.equal(classifyWriteError(undefined), "unknown");
  assert.equal(classifyWriteError("a string"), "unknown");
  assert.equal(classifyWriteError({}), "unknown");
});
