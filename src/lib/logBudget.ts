/* ============================================================================
 * logBudget.ts — keeping the review log inside a 5MB drawer.
 *
 * The review log lives in localStorage next to the decks and the cards,
 * because store.ts is synchronous and everything reads `db.log` without
 * awaiting anything. localStorage gives an origin about 5MB. A year of daily
 * review is 15–20 thousand entries, and every entry that was answered by
 * writing from memory carries up to 260 characters of what you wrote — so the
 * log alone could reach several megabytes and push the whole database over
 * the wall.
 *
 * What happened then was the worst possible thing: `setItem` threw, the save
 * path logged to the console and returned, and the app carried on looking
 * completely normal while nothing at all was being written. An hour of
 * reviewing would disappear on reload.
 *
 * This module is the weight-loss half of the fix (services/storage.ts is the
 * "never fail silently" half). Two operations, in the order they should be
 * tried, cheapest loss first:
 *
 *   1. shedAttempts — drop the recall text from older entries. This is by far
 *      the biggest field and the shortest-lived: lib/dayBrief reads at most
 *      the last eight attempts, over a window of a day or two, so anything
 *      past a few hundred entries is already unreachable. The grade, the
 *      state, the day and the card id all survive, so retention, the streak
 *      and the activity grid are untouched.
 *
 *   2. capLog — actually forget the oldest reviews. This one loses history
 *      that the activity grid draws, so it is last, and the caller is
 *      expected to say out loud that it happened.
 *
 * Pure and dependency-free so logBudget.test.ts can hold it to that: shedding
 * must never change what the grid or the retention figure would report.
 *
 * The real answer is to move the log into IndexedDB, where the quota is two
 * orders of magnitude larger and the chat, journal and memory stores already
 * live. That is a migration with real risk and it is not the thing to do to a
 * database that is already failing to save. See START-HERE §3.
 * ========================================================================== */
import type { LogEntry } from "@/types";

/** How many of the most recent attempt-carrying entries keep their text.
 *  dayBrief quotes at most eight, from the last day or two; several hundred is
 *  a generous margin over anything that can still be read. */
export const ATTEMPT_WINDOW = 400;

/** The point at which the log is trimmed in the ordinary course of events.
 *  Roughly three years of fifteen reviews a day once attempts are shed. */
export const LOG_MAX = 20000;

/** Where the emergency trim lands when the database will not fit at all.
 *  Deliberately far below LOG_MAX: a save that is failing needs headroom, not
 *  a haircut that puts it back on the wall an hour later. */
export const LOG_EMERGENCY = 2500;

/**
 * Strip the recall text (and the marker's verdict, which is meaningless
 * without it) from every entry older than the most recent `keep` that carry
 * one. Returns a new array only when something changed, so an unchanged log
 * costs one pass and no allocation.
 */
export function shedAttempts(log: LogEntry[], keep = ATTEMPT_WINDOW): { log: LogEntry[]; shed: number } {
  /* Counted from the end so "the most recent `keep`" means the most recent
     `keep` *attempts*, not the last `keep` entries — a spell of reviewing
     without the recall box on would otherwise push real attempts out.

     The scan stops as soon as it has found one attempt too many, so the
     ordinary case — a log well inside the window — costs a walk and no
     allocation. This runs after every grade, in the review loop, over a list
     that may hold twenty thousand entries. */
  let seen = 0;
  const keepFrom = new Set<number>();
  let overflow = false;
  for (let i = log.length - 1; i >= 0; i--) {
    if (!log[i].a) continue;
    if (seen < keep) {
      keepFrom.add(i);
      seen++;
    } else {
      overflow = true;
      break;
    }
  }
  if (!overflow) return { log, shed: 0 };

  let shed = 0;
  const out = log.map((e, i) => {
    if (!e.a || keepFrom.has(i)) return e;
    shed++;
    const { a: _a, v: _v, ...rest } = e;
    return rest as LogEntry;
  });

  return { log: out, shed };
}

/** Keep the most recent `max` entries. Returns how many were forgotten, so
 *  the caller can say so rather than letting a year quietly become a month. */
export function capLog(log: LogEntry[], max = LOG_MAX): { log: LogEntry[]; dropped: number } {
  if (log.length <= max) return { log, dropped: 0 };
  return { log: log.slice(-max), dropped: log.length - max };
}

/** Rough share of a 5MB localStorage budget, for the readout on the Data
 *  page. Characters, not bytes: a JS string is what localStorage measures,
 *  and most of this content is ASCII, so the two are close enough to warn
 *  with and not close enough to promise with. */
export const LOCAL_STORAGE_BUDGET = 5 * 1024 * 1024;

export function pressure(bytes: number | null): number | null {
  if (bytes == null) return null;
  return Math.min(1, bytes / LOCAL_STORAGE_BUDGET);
}
