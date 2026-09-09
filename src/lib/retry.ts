/* ============================================================================
 * retry.ts — which failures are worth trying again, and how long to wait.
 *
 * Nothing in this app retried anything. A 429 from a provider that would have
 * served you fine two seconds later ended the message, left an error bubble,
 * and made you press Retry by hand — and 429 is not an exotic failure, it is
 * the single most common thing that happens to a chat client on a free tier or
 * a shared key. So is a 502 from a gateway mid-deploy, and so is a phone
 * changing wifi networks.
 *
 * Two rules decide everything here, and the second one matters more:
 *
 *   Only retry what could plausibly differ next time. A 401 is a wrong key
 *   and a 404 is a model that does not exist; trying those again just spends
 *   the user's time twice before telling them the same thing. Retrying a 400
 *   is worse — it can be a malformed request that a provider bills for.
 *
 *   Never retry a request that has already produced output. A stream that
 *   dies after two paragraphs cannot be resumed, only restarted, and
 *   restarting it silently would either duplicate those paragraphs or throw
 *   them away. The caller keeps the partial and says the connection dropped;
 *   that is the honest end of a half-finished answer, and it is what the abort
 *   path already did.
 *
 * Pure: no fetch, no timers, no DOM. backends.ts owns the loop and the
 * (abortable) sleeping; this owns the policy, so retry.test.ts can hold the
 * policy to its promises without a network.
 * ========================================================================== */

/** Total attempts, including the first. Three is the number that survives a
 *  rate-limit burst and a gateway blip without turning a broken key into a
 *  thirty-second wait before the error you needed immediately. */
export const MAX_ATTEMPTS = 3;

/** Ceiling on any single wait. A provider that asks for five minutes is
 *  telling you to come back later, not to hold the tab hostage — past this we
 *  hand the wait back to the user, who can press Retry when they are ready. */
export const MAX_DELAY_MS = 20_000;

const BASE_DELAY_MS = 700;

/**
 * Statuses worth trying again.
 *
 * 408 request timeout, 425 too early, 429 rate limited, and the 5xx family
 * except 501 (not implemented) and 505 — those are statements about the
 * server's capabilities, not about this moment.
 */
export function isRetryableStatus(status: number): boolean {
  if (status === 408 || status === 425 || status === 429) return true;
  if (status === 501 || status === 505) return false;
  return status >= 500 && status < 600;
}

export interface RetryInput {
  /** 1 for the first failure, 2 for the second. */
  attempt: number;
  /** Absent for a network-level failure, which has no status at all. */
  status?: number;
  /** The provider's own `Retry-After` header, verbatim. Seconds or a date. */
  retryAfter?: string | null;
  /** True when fetch() itself rejected: DNS, connection refused, CORS, a
   *  network that went away. */
  networkError?: boolean;
  /** True once any token has been delivered to the caller. Hard stop. */
  started?: boolean;
}

export interface RetryPlan {
  retry: boolean;
  delayMs: number;
  /** Said in the log line and, on the last attempt, to the user. */
  reason: string;
}

/**
 * `Retry-After` as milliseconds, or null when it is absent or unreadable.
 *
 * Two legal forms — delta-seconds and an HTTP date — and providers send both.
 * A date already in the past yields 0 rather than a negative wait, which is a
 * real response from a server whose clock disagrees with yours.
 */
export function parseRetryAfter(value: string | null | undefined, now = Date.now()): number | null {
  if (!value) return null;
  const raw = value.trim();
  if (/^\d+$/.test(raw)) return Math.max(0, parseInt(raw, 10) * 1000);
  const at = Date.parse(raw);
  if (Number.isNaN(at)) return null;
  return Math.max(0, at - now);
}

/** Deterministic in the delay it computes; the caller adds jitter. Kept pure
 *  so a test can assert the shape of the backoff rather than a range. */
export function planRetry(input: RetryInput, now = Date.now()): RetryPlan {
  if (input.started) {
    return { retry: false, delayMs: 0, reason: "the reply had already started — a stream cannot be resumed" };
  }
  if (input.attempt >= MAX_ATTEMPTS) {
    return { retry: false, delayMs: 0, reason: `gave up after ${MAX_ATTEMPTS} attempts` };
  }

  const backoff = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (input.attempt - 1));

  if (input.networkError) {
    return { retry: true, delayMs: backoff, reason: "could not reach the provider" };
  }
  if (input.status == null || !isRetryableStatus(input.status)) {
    return { retry: false, delayMs: 0, reason: "not a failure that trying again would fix" };
  }

  /* The provider's own number wins over ours when it gave one — it knows when
     the window opens and we are guessing. Still capped: a header asking for
     ten minutes is a "come back later", and holding the tab through it is
     worse than handing the decision to the person sitting there. */
  const asked = parseRetryAfter(input.retryAfter, now);
  if (asked != null) {
    if (asked > MAX_DELAY_MS) {
      return { retry: false, delayMs: 0, reason: `the provider asked for ${Math.round(asked / 1000)}s — too long to wait for you` };
    }
    return { retry: true, delayMs: Math.max(asked, backoff), reason: `rate limited; the provider asked for ${Math.round(asked / 1000)}s` };
  }

  return {
    retry: true,
    delayMs: backoff,
    reason: input.status === 429 ? "rate limited" : `provider returned ${input.status}`
  };
}

/** Up to a quarter added, never subtracted: several tabs that failed on the
 *  same rate limit must not come back in lockstep and trip it again. */
export function jitter(delayMs: number, random = Math.random): number {
  return Math.round(delayMs * (1 + random() * 0.25));
}
