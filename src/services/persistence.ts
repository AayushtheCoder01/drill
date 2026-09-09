/* ============================================================================
 * persistence.ts — one place a failed write is reported to.
 *
 * Drill stores in two halves. The review database goes to localStorage
 * (store.ts, which has its own SaveState because it is synchronous and can
 * recover in-line). Conversations, the journal, memory, exams and the usage
 * ledger go to IndexedDB, asynchronously, from a dozen call sites.
 *
 * Every one of those call sites looked like this:
 *
 *     void idbPut(STORE_CONV, c).catch((e) => console.error("save failed", e));
 *     void idbPut(STORE_META, metaOf(c)).catch(() => undefined);
 *
 * — and two of them had no catch at all. So a browser that had started
 * refusing writes (quota reached, storage evicted mid-session, a private
 * window, a locked-down profile) produced a console line nobody had open, and
 * an app that went on looking completely healthy while nothing it wrote
 * survived the reload. That is the same failure the localStorage path had, in
 * five more places.
 *
 * There is nothing sophisticated here. It records that a write failed, which
 * one, and how many since — and it has the subscribe/getVersion shape every
 * other store in this app has, so `useStoreSync(persistence)` binds the alarm
 * to it and Shell renders the thing across the top of every section.
 *
 * `guard()` is the only API call sites need: wrap the promise, keep going.
 * A failed write must never reject into the caller — losing a message is bad,
 * and taking the send path down with it is worse.
 * ========================================================================== */

export interface WriteFailure {
  /** What was being written, in words a person can act on: "conversation",
   *  "journal entry", "memory". Shown to the user, so no store constants. */
  area: string;
  message: string;
  /** When the most recent one happened. */
  at: number;
  /** How many have failed since the last clear. One is an accident; a
   *  hundred is a browser that has stopped storing anything. */
  count: number;
}

let failure: WriteFailure | null = null;
let version = 0;
const listeners = new Set<() => void>();

function notify(): void {
  version++;
  listeners.forEach((l) => l());
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getVersion(): number {
  return version;
}

/** The current failure, or null when everything is being written. */
export function latest(): WriteFailure | null {
  return failure;
}

export function report(area: string, e: unknown): void {
  const message = e instanceof Error ? e.message : String(e);
  failure = { area, message, at: Date.now(), count: (failure?.count ?? 0) + 1 };
  console.error("Drill could not save a " + area, e);
  notify();
}

/** Cleared when the user has acknowledged it, and — more usefully — by the
 *  next write that succeeds, so a one-off blip does not leave a banner up
 *  for the rest of the session. */
export function clear(): void {
  if (!failure) return;
  failure = null;
  notify();
}

/**
 * Attach reporting to an IndexedDB write and swallow the rejection.
 *
 * Success clears a standing failure: the interesting state is "writes are
 * failing *now*", and a store that has started working again should take its
 * own banner down.
 */
export function guard<T>(area: string, p: Promise<T>): Promise<T | undefined> {
  return p.then(
    (v) => {
      if (failure) clear();
      return v;
    },
    (e) => {
      report(area, e);
      return undefined;
    }
  );
}
