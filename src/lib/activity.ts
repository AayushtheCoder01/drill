/* ============================================================================
 * activity.ts — the review log, read as days.
 *
 * Everything the home page draws is derived here, from db.log alone, so the
 * grid, the streak and the totals can never disagree with each other (or with
 * the rail, which does the same arithmetic on a seven-day window).
 *
 * Nothing is stored. A day is a local calendar day — the same dayKey() the
 * session and the rollover use — because a streak measured in UTC would break
 * for anyone who studies in the evening.
 * ========================================================================== */
import { dayKey } from "@/lib/util";
import type { LogEntry } from "@/types";

/* Days are stepped with the calendar, never with `+ 86400000`. Adding a fixed
   number of milliseconds drifts by an hour across a daylight-saving boundary,
   which is enough to put a column on the wrong weekday or silently break a
   streak twice a year. */
function midnight(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function addDays(ts: number, n: number): number {
  const d = new Date(ts);
  d.setDate(d.getDate() + n);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function parseDayKey(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).setHours(0, 0, 0, 0);
}

export interface DayCell {
  /** Local midnight of the day. */
  ts: number;
  key: string;
  count: number;
  /** 0-4. Zero is "nothing", 1-4 are quartile-ish steps against the busiest
   *  day in the window, so the grid stays legible whether you do 5 cards a
   *  day or 500. */
  level: number;
  /** Days after today, padding out the last week. Drawn as holes. */
  future: boolean;
}

/** Reviews per local day, for whatever slice of the log you hand it. */
export function countsByDay(log: LogEntry[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of log) m.set(dayKey(e.t), (m.get(dayKey(e.t)) || 0) + 1);
  return m;
}

function levelFor(count: number, max: number): number {
  if (count <= 0) return 0;
  if (max <= 1) return 4;
  const t = count / max;
  if (t <= 0.25) return 1;
  if (t <= 0.5) return 2;
  if (t <= 0.75) return 3;
  return 4;
}

/**
 * `weeks` columns of seven days, oldest first, each column Sunday→Saturday —
 * the GitHub shape. The last column contains today, and the days after it are
 * marked `future` so the grid stays rectangular without inventing activity.
 */
export function grid(log: LogEntry[], weeks = 53): DayCell[][] {
  const counts = countsByDay(log);
  const todayMid = midnight(Date.now());
  // Walk back to the Sunday of the current week, then back `weeks - 1` more.
  const startOfWeek = addDays(todayMid, -new Date(todayMid).getDay());
  const start = addDays(startOfWeek, -(weeks - 1) * 7);

  let max = 0;
  const raw: { ts: number; key: string; count: number }[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const ts = addDays(start, i);
    const key = dayKey(ts);
    const count = ts > todayMid ? 0 : counts.get(key) || 0;
    if (count > max) max = count;
    raw.push({ ts, key, count });
  }

  const out: DayCell[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col: DayCell[] = [];
    for (let d = 0; d < 7; d++) {
      const r = raw[w * 7 + d];
      col.push({ ...r, level: levelFor(r.count, max), future: r.ts > todayMid });
    }
    out.push(col);
  }
  return out;
}

/** Month names to print above the grid, one per column where that column is
 *  the first of its month. Returns [columnIndex, label] pairs. */
export function monthLabels(cols: DayCell[][]): { col: number; label: string }[] {
  const out: { col: number; label: string }[] = [];
  let last = -1;
  let lastCol = -99;
  cols.forEach((col, i) => {
    const m = new Date(col[0].ts).getMonth();
    // Two labels three columns apart collide — the first week of a month can
    // be a stub of one or two days, and printing "Aug Sep" on top of each
    // other is worse than dropping the stub.
    if (m !== last && i - lastCol >= 3 && i < cols.length - 1) {
      out.push({ col: i, label: new Date(col[0].ts).toLocaleDateString(undefined, { month: "short" }) });
      last = m;
      lastCol = i;
    }
  });
  return out;
}

/**
 * Current and longest run of consecutive active days.
 *
 * Today not being done yet does not break the streak — it has not happened
 * yet. A day with nothing on it, once it is behind you, does.
 */
export function streaks(log: LogEntry[]): { current: number; longest: number; activeDays: number } {
  const counts = countsByDay(log);
  const active = (ts: number) => (counts.get(dayKey(ts)) || 0) > 0;
  const todayMid = midnight(Date.now());

  let current = 0;
  let cursor = active(todayMid) ? todayMid : addDays(todayMid, -1);
  while (active(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }

  const days = [...counts.keys()].map(parseDayKey).sort((a, b) => a - b);
  let longest = 0;
  let run = 0;
  let prev = 0;
  for (const t of days) {
    run = prev && t === addDays(prev, 1) ? run + 1 : 1;
    if (run > longest) longest = run;
    prev = t;
  }

  return { current, longest, activeDays: counts.size };
}
