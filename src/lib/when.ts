/* ============================================================================
 * when.ts — turning "last week" into {from, to} without an API call.
 *
 * Deterministic, testable, free — and it is how an exam scope becomes
 * legible before a call is spent on it: "14–20 March · 4 entries · 23 cards"
 * has to be computable the instant you finish typing. Anything this cannot
 * parse returns null; the caller falls back to a date-range picker rather
 * than guessing.
 * ========================================================================== */

export interface WhenRange {
  from: number;
  to: number;
  label: string;
}

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december"
];

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}
function endOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(23, 59, 59, 999);
  return c;
}
function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}
/** Monday of the week containing `d`, at local midnight. */
function mondayOf(d: Date): Date {
  const c = startOfDay(d);
  const day = c.getDay(); // 0=Sun..6=Sat
  return addDays(c, day === 0 ? -6 : 1 - day);
}
function fmtDate(d: Date): string {
  return d.toLocaleDateString(undefined, { day: "numeric", month: "long" });
}
function fmtRange(from: Date, to: Date): string {
  if (startOfDay(from).getTime() === startOfDay(to).getTime()) return fmtDate(from);
  if (from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear()) {
    return `${from.getDate()}–${to.getDate()} ${from.toLocaleDateString(undefined, { month: "long" })}`;
  }
  return `${fmtDate(from)} – ${fmtDate(to)}`;
}

function tryParseDate(input: string, now: Date): Date | null {
  const s = input.trim();
  if (!s) return null;

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)(?:\s+(\d{4}))?$/i);
  if (m) {
    const mi = MONTHS.findIndex((mo) => mo.startsWith(m![2].toLowerCase()));
    if (mi >= 0) return new Date(m[3] ? Number(m[3]) : now.getFullYear(), mi, Number(m[1]));
  }

  m = s.match(/^([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?(?:\s+(\d{4}))?$/i);
  if (m) {
    const mi = MONTHS.findIndex((mo) => mo.startsWith(m![1].toLowerCase()));
    if (mi >= 0) return new Date(m[3] ? Number(m[3]) : now.getFullYear(), mi, Number(m[2]));
  }

  const t = Date.parse(s);
  if (!isNaN(t)) return new Date(t);
  return null;
}

/** Parses the phrases people actually type when asking to be tested on a
 *  window of time: today · yesterday · this week · last week · this month ·
 *  last N days/weeks/months · N days/weeks ago · since <date> · <month> ·
 *  <date>..<date>, plus a bare date. Returns null for anything else. */
export function parseWhen(input: string, now: Date = new Date()): WhenRange | null {
  const raw = input.trim();
  if (!raw) return null;
  const s = raw.toLowerCase();

  if (s === "today") return { from: startOfDay(now).getTime(), to: endOfDay(now).getTime(), label: "today" };
  if (s === "yesterday") {
    const y = addDays(now, -1);
    return { from: startOfDay(y).getTime(), to: endOfDay(y).getTime(), label: "yesterday" };
  }
  if (s === "this week") return { from: mondayOf(now).getTime(), to: endOfDay(now).getTime(), label: "this week" };
  if (s === "last week") {
    const thisMon = mondayOf(now);
    const f = addDays(thisMon, -7);
    const t = addDays(thisMon, -1);
    return { from: f.getTime(), to: endOfDay(t).getTime(), label: `last week (${fmtRange(f, t)})` };
  }
  if (s === "this month") {
    return { from: new Date(now.getFullYear(), now.getMonth(), 1).getTime(), to: endOfDay(now).getTime(), label: "this month" };
  }
  if (s === "last month") {
    const f = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const t = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: f.getTime(), to: endOfDay(t).getTime(), label: `last month (${f.toLocaleDateString(undefined, { month: "long", year: "numeric" })})` };
  }

  let m = s.match(/^last (\d+) days?$/);
  if (m) {
    const n = Number(m[1]);
    return { from: startOfDay(addDays(now, -(n - 1))).getTime(), to: endOfDay(now).getTime(), label: `last ${n} days` };
  }
  m = s.match(/^last (\d+) weeks?$/);
  if (m) {
    const n = Number(m[1]);
    return { from: startOfDay(addDays(now, -(n * 7 - 1))).getTime(), to: endOfDay(now).getTime(), label: `last ${n} weeks` };
  }
  m = s.match(/^last (\d+) months?$/);
  if (m) {
    const n = Number(m[1]);
    return { from: startOfDay(new Date(now.getFullYear(), now.getMonth() - n, now.getDate())).getTime(), to: endOfDay(now).getTime(), label: `last ${n} months` };
  }

  m = s.match(/^(\d+) days? ago$/);
  if (m) {
    const d = addDays(now, -Number(m[1]));
    return { from: startOfDay(d).getTime(), to: endOfDay(d).getTime(), label: `${m[1]} day${m[1] === "1" ? "" : "s"} ago (${fmtDate(d)})` };
  }
  m = s.match(/^(\d+) weeks? ago$/);
  if (m) {
    const d = addDays(now, -Number(m[1]) * 7);
    return { from: startOfDay(d).getTime(), to: endOfDay(d).getTime(), label: `${m[1]} week${m[1] === "1" ? "" : "s"} ago (${fmtDate(d)})` };
  }

  m = s.match(/^since\s+(.+)$/);
  if (m) {
    const d = tryParseDate(m[1], now);
    if (d) return { from: startOfDay(d).getTime(), to: endOfDay(now).getTime(), label: `since ${fmtDate(d)}` };
  }

  // ".." or an em/en dash first — a bare hyphen is ambiguous with the
  // hyphens inside an ISO date, so it only counts as a separator when it
  // has whitespace on both sides ("10 march - 15 march", not "2026-03-10").
  m = raw.match(/^(.+?)\s*(?:\.\.|—|–)\s*(.+)$/) || raw.match(/^(.+?)\s+to\s+(.+)$/i) || raw.match(/^(.+?)\s+-\s+(.+)$/);
  if (m) {
    const a = tryParseDate(m[1], now);
    const b = tryParseDate(m[2], now);
    if (a && b) {
      const [from, to] = a.getTime() <= b.getTime() ? [a, b] : [b, a];
      return { from: startOfDay(from).getTime(), to: endOfDay(to).getTime(), label: fmtRange(from, to) };
    }
  }

  if (s.length >= 3) {
    const mi = MONTHS.findIndex((mo) => mo === s || mo.startsWith(s));
    if (mi >= 0) {
      let year = now.getFullYear();
      if (mi > now.getMonth()) year -= 1; // "march" said in December means last March
      const f = new Date(year, mi, 1);
      const t = new Date(year, mi + 1, 0);
      return { from: f.getTime(), to: endOfDay(t).getTime(), label: f.toLocaleDateString(undefined, { month: "long", year: "numeric" }) };
    }
  }

  const d = tryParseDate(raw, now);
  if (d) return { from: startOfDay(d).getTime(), to: endOfDay(d).getTime(), label: fmtDate(d) };

  return null;
}

/** lib/util's U.dayKey()/U.today() format: "2026-8-31", not zero-padded. */
export function parseDayKey(day: string): Date {
  const [y, mo, d] = day.split("-").map(Number);
  return new Date(y, mo - 1, d);
}

export function dayInRange(day: string, range: WhenRange): boolean {
  const t = startOfDay(parseDayKey(day)).getTime();
  return t >= startOfDay(new Date(range.from)).getTime() && t <= startOfDay(new Date(range.to)).getTime();
}
