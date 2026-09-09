/* ============================================================================
 * retry.test.ts — trying again must be safe before it is useful.
 *
 * Two of these are load-bearing in a way the others are not. Retrying a
 * request that already streamed text would duplicate it on the screen or
 * silently drop it, and retrying a 400 can be a malformed request the provider
 * bills for. Everything else here is about not making a broken key take thirty
 * seconds to report itself.
 * ========================================================================== */
import test from "node:test";
import assert from "node:assert/strict";
import { MAX_ATTEMPTS, MAX_DELAY_MS, isRetryableStatus, jitter, parseRetryAfter, planRetry } from "@/lib/retry";

test("a reply that has started is never retried", () => {
  /* The rule the whole thing rests on: a stream cannot be resumed, only
     restarted, and restarting one that has already put two paragraphs on the
     screen either duplicates them or throws them away. */
  for (const status of [429, 500, 503]) {
    const plan = planRetry({ attempt: 1, status, started: true });
    assert.equal(plan.retry, false, `status ${status} retried after output had started`);
    assert.match(plan.reason, /already started/);
  }
  assert.equal(planRetry({ attempt: 1, networkError: true, started: true }).retry, false);
});

test("only failures that could differ next time are retried", () => {
  /* 429 and the 5xx family are about this moment. 401 is a wrong key, 404 is
     a model that does not exist, 400 is a request the provider refused — all
     three give the same answer next time, and the user needs the message now
     rather than after three round trips. */
  assert.equal(planRetry({ attempt: 1, status: 429 }).retry, true);
  assert.equal(planRetry({ attempt: 1, status: 500 }).retry, true);
  assert.equal(planRetry({ attempt: 1, status: 502 }).retry, true);
  assert.equal(planRetry({ attempt: 1, status: 503 }).retry, true);
  assert.equal(planRetry({ attempt: 1, status: 408 }).retry, true);

  for (const dead of [400, 401, 403, 404, 422, 501, 505]) {
    assert.equal(planRetry({ attempt: 1, status: dead }).retry, false, `status ${dead} should not be retried`);
  }
});

test("a network failure has no status and is still retried", () => {
  /* DNS, connection refused, a phone changing wifi. fetch() rejects and there
     is nothing to read a status from. */
  const plan = planRetry({ attempt: 1, networkError: true });
  assert.equal(plan.retry, true);
  assert.ok(plan.delayMs > 0);
});

test("attempts are bounded", () => {
  assert.equal(planRetry({ attempt: MAX_ATTEMPTS, status: 429 }).retry, false);
  assert.equal(planRetry({ attempt: MAX_ATTEMPTS + 5, status: 500 }).retry, false);
  assert.match(planRetry({ attempt: MAX_ATTEMPTS, status: 429 }).reason, /gave up/);
});

test("the wait grows, and stops growing", () => {
  const first = planRetry({ attempt: 1, status: 500 }).delayMs;
  const second = planRetry({ attempt: 2, status: 500 }).delayMs;
  assert.ok(second > first, "backoff must back off");
  for (let a = 1; a < MAX_ATTEMPTS; a++) {
    assert.ok(planRetry({ attempt: a, status: 500 }).delayMs <= MAX_DELAY_MS);
  }
});

test("the provider's own Retry-After wins when it gave one", () => {
  const plan = planRetry({ attempt: 1, status: 429, retryAfter: "5" });
  assert.equal(plan.retry, true);
  assert.equal(plan.delayMs, 5000, "it knows when the window opens; we are guessing");
});

test("a Retry-After shorter than the backoff does not shorten it", () => {
  /* Coming back the instant a provider says you may is how you trip the same
     limit again. The larger of the two wins. */
  const plan = planRetry({ attempt: 2, status: 429, retryAfter: "0" });
  assert.ok(plan.delayMs >= planRetry({ attempt: 2, status: 429 }).delayMs);
});

test("a Retry-After longer than anyone should wait hands the decision back", () => {
  /* "Come back in five minutes" is not something to hold a tab through — the
     user gets the error and a Retry button they can press when ready. */
  const plan = planRetry({ attempt: 1, status: 429, retryAfter: "300" });
  assert.equal(plan.retry, false);
  assert.match(plan.reason, /300s/);
});

test("Retry-After is read in both legal forms", () => {
  const now = Date.UTC(2026, 0, 1, 12, 0, 0);
  assert.equal(parseRetryAfter("12", now), 12_000);
  assert.equal(parseRetryAfter(new Date(now + 4000).toUTCString(), now), 4000);
  /* A date already gone is a server whose clock disagrees with yours, not a
     negative wait. */
  assert.equal(parseRetryAfter(new Date(now - 60_000).toUTCString(), now), 0);
  assert.equal(parseRetryAfter(null, now), null);
  assert.equal(parseRetryAfter("soon please", now), null);
  assert.equal(parseRetryAfter("", now), null);
});

test("an unreadable Retry-After falls back to the backoff rather than to zero", () => {
  const plan = planRetry({ attempt: 1, status: 429, retryAfter: "whenever" });
  assert.equal(plan.retry, true);
  assert.ok(plan.delayMs > 0);
});

test("jitter only ever adds, and stays bounded", () => {
  /* Several tabs that failed on the same rate limit must not come back in
     lockstep — but a wait that could come out *shorter* than the plan would
     defeat the backoff it was jittering. */
  assert.equal(jitter(1000, () => 0), 1000);
  assert.equal(jitter(1000, () => 1), 1250);
  for (let i = 0; i < 50; i++) {
    const v = jitter(800);
    assert.ok(v >= 800 && v <= 1000, `jittered to ${v}`);
  }
});

test("isRetryableStatus is exact about the 5xx family", () => {
  assert.equal(isRetryableStatus(500), true);
  assert.equal(isRetryableStatus(599), true);
  assert.equal(isRetryableStatus(501), false, "not implemented is not a bad moment");
  assert.equal(isRetryableStatus(505), false);
  assert.equal(isRetryableStatus(499), false);
  assert.equal(isRetryableStatus(600), false);
});
