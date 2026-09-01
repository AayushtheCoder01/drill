/* ============================================================================
 * fsrs.ts — FSRS-6 scheduling. Pure: no DOM, no storage, no globals.
 *
 * Every function takes the card state and a params object and returns a new
 * value. Nothing here mutates its arguments, so the same state graded four
 * different ways gives you four independent previews (that is how the interval
 * labels under the grade buttons are produced).
 *
 * Grades are 1 again, 2 hard, 3 good, 4 easy.
 * ========================================================================== */
import type { CardState, FSRSParams, Grade, SRSState } from "@/types";

const MIN = 60000;
const DAY = 86400000;

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

/** The 21 FSRS-6 weights. Pinned to the reference release so that everyone's
 *  scheduling matches out of the box; override via config.json -> fsrs.weights
 *  if you have optimised your own set against your review log. */
export const DEFAULT_WEIGHTS: number[] = [
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835,
  0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542
];

export const DEFAULT_PARAMS: FSRSParams = {
  weights: DEFAULT_WEIGHTS,
  retention: 0.9,
  maxInterval: 365,
  learningSteps: [10],
  relearningSteps: [10],
  fuzz: true,
  leechThreshold: 4
};

/** Fill in anything the caller left out, and validate the weights so a bad
 *  config file degrades to the defaults instead of producing NaN intervals. */
export function normParams(p?: Partial<FSRSParams> | null): Required<FSRSParams> {
  const src = p || {};
  let w = src.weights;
  if (!Array.isArray(w) || w.length !== 21 || w.some((x) => typeof x !== "number" || !isFinite(x))) {
    w = DEFAULT_WEIGHTS;
  }
  return {
    weights: w,
    retention: clamp(src.retention || DEFAULT_PARAMS.retention, 0.7, 0.99),
    maxInterval: clamp(src.maxInterval || DEFAULT_PARAMS.maxInterval, 1, 36500),
    learningSteps: src.learningSteps && src.learningSteps.length ? src.learningSteps : DEFAULT_PARAMS.learningSteps,
    relearningSteps:
      src.relearningSteps && src.relearningSteps.length ? src.relearningSteps : DEFAULT_PARAMS.relearningSteps,
    fuzz: src.fuzz !== false,
    leechThreshold: src.leechThreshold || DEFAULT_PARAMS.leechThreshold,
    rng: src.rng || Math.random
  };
}

function decayOf(w: number[]): number {
  return w[20];
}
function factorOf(w: number[]): number {
  return Math.pow(0.9, -1 / w[20]) - 1;
}

export function blankState(id: string): SRSState {
  return { id, state: "new", step: 0, S: 0, D: 0, due: 0, reps: 0, lapses: 0, last: 0 };
}

/** Probability of recall after `days` with stability S. */
export function retrievability(days: number, S: number, params?: Partial<FSRSParams> | null): number {
  const p = normParams(params);
  const w = p.weights;
  return Math.pow(1 + (factorOf(w) * days) / Math.max(S, 0.01), -decayOf(w));
}

/** The interval that lands retrievability exactly on the retention target. */
export function intervalDays(S: number, params?: Partial<FSRSParams> | null): number {
  const p = normParams(params);
  const w = p.weights;
  const d = (Math.max(S, 0.01) / factorOf(w)) * (Math.pow(p.retention, -1 / decayOf(w)) - 1);
  return clamp(Math.round(d), 1, p.maxInterval);
}

/* ---------- the four update equations ---------- */
function clampD(d: number): number {
  return clamp(d, 1, 10);
}
function initS(w: number[], g: Grade): number {
  return clamp(w[g - 1], 0.01, 36500);
}
function initD(w: number[], g: Grade): number {
  return clampD(w[4] - Math.exp(w[5] * (g - 1)) + 1);
}

function nextD(w: number[], D0: number, g: Grade): number {
  const dd = D0 + (-w[6] * (g - 3) * (10 - D0)) / 9;
  return clampD(w[7] * initD(w, 4) + (1 - w[7]) * dd);
}

/** Successful review: stability grows, and grows more when the card was
 *  nearly forgotten (low R) — that is the spacing effect in one line. */
function gainS(w: number[], D0: number, S: number, R: number, g: Grade): number {
  const h = g === 2 ? w[15] : 1;
  const b = g === 4 ? w[16] : 1;
  return (
    S *
    (1 +
      Math.exp(w[8]) *
        (11 - D0) *
        Math.pow(Math.max(S, 0.01), -w[9]) *
        (Math.exp(w[10] * (1 - R)) - 1) *
        h *
        b)
  );
}

/** Lapse: stability collapses, but never above where it already was. */
function lapseS(w: number[], D0: number, S: number, R: number): number {
  return Math.min(S, w[11] * Math.pow(D0, -w[12]) * (Math.pow(S + 1, w[13]) - 1) * Math.exp(w[14] * (1 - R)));
}

/** Same-day repeat, which cannot use the elapsed-time equations. */
function shortS(w: number[], S: number, g: Grade): number {
  return S * Math.exp(w[17] * (g - 3 + w[18])) * Math.pow(Math.max(S, 0.01), -w[19]);
}

/** +-5% jitter so a big import does not come back as one giant wall. */
function applyFuzz(days: number, rng: () => number): number {
  if (days < 3) return days;
  return Math.max(2, Math.round(days * (0.95 + rng() * 0.1)));
}

export interface ReviewOpts {
  now?: number;
  noFuzz?: boolean;
}

/** Grade a card. Returns a NEW state object; `st` is untouched. */
export function review(st: SRSState | null, g: Grade, params?: Partial<FSRSParams> | null, opts?: ReviewOpts): SRSState {
  const p = normParams(params);
  const w = p.weights;
  const o = opts || {};
  const now = o.now || Date.now();
  const s: SRSState = { ...(st || blankState("?")) };
  const isNew = !s.state || s.state === "new" || !s.reps;

  if (isNew) {
    s.S = initS(w, g);
    s.D = initD(w, g);
  } else {
    const el = Math.max(0, (now - (s.last || now)) / DAY);
    const R = retrievability(el, s.S, p);
    s.lastR = R;
    if (g === 1 && s.state === "review") {
      s.S = lapseS(w, s.D, s.S, R);
      s.lapses = (s.lapses || 0) + 1;
    } else if (el < 1 && s.state !== "review") {
      s.S = shortS(w, s.S, g);
    } else {
      s.S = g === 1 ? lapseS(w, s.D, s.S, R) : gainS(w, s.D, s.S, R, g);
    }
    s.D = nextD(w, s.D, g);
  }
  s.S = clamp(s.S, 0.01, 36500);

  const learn = p.learningSteps;
  const relearn = p.relearningSteps;
  function graduate() {
    s.state = "review";
    s.step = 0;
    let d = intervalDays(s.S, p);
    if (p.fuzz && !o.noFuzz) d = applyFuzz(d, p.rng);
    s.due = now + d * DAY;
  }

  const phase: CardState = isNew ? "new" : s.state;
  if (phase === "review") {
    if (g === 1) {
      s.state = "relearning";
      s.step = 0;
      s.due = now + relearn[0] * MIN;
    } else graduate();
  } else if (phase === "relearning") {
    if (g === 1) {
      s.step = 0;
      s.due = now + relearn[0] * MIN;
    } else if (g === 2) {
      s.due = now + Math.round(relearn[0] * 1.5) * MIN;
    } else graduate();
  } else {
    // new or learning
    if (g === 1) {
      s.state = "learning";
      s.step = 0;
      s.due = now + learn[0] * MIN;
    } else if (g === 2) {
      s.state = "learning";
      s.due = now + Math.round(learn[0] * 1.5) * MIN;
    } else if (g === 3) {
      if (!isNew && s.step >= learn.length - 1) graduate();
      else {
        s.state = "learning";
        s.step = (s.step || 0) + (isNew ? 0 : 1);
        s.due = now + learn[Math.min(s.step, learn.length - 1)] * MIN;
      }
    } else graduate();
  }

  s.reps = (s.reps || 0) + 1;
  s.last = now;
  return s;
}

/** What each of the four buttons would do, in minutes. No fuzz, so the label
 *  matches what the learner actually sees on the ladder. */
export function previewMinutes(st: SRSState | null, params?: Partial<FSRSParams> | null, now?: number): number[] {
  const n = now || Date.now();
  return ([1, 2, 3, 4] as Grade[]).map((g) => {
    const s = review(st, g, params, { now: n, noFuzz: true });
    return Math.max(1, (s.due - n) / MIN);
  });
}

/** The card's current interval in minutes — for the ladder marker. */
export function currentIntervalMinutes(st: SRSState | null | undefined, params?: Partial<FSRSParams> | null): number {
  if (!st || !st.reps) return 0;
  if (st.state === "review") return intervalDays(st.S, params) * 1440;
  return Math.max(10, (st.due - (st.last || st.due)) / MIN);
}

export function isLeech(st: SRSState | null | undefined, params?: Partial<FSRSParams> | null): boolean {
  return ((st && st.lapses) || 0) >= normParams(params).leechThreshold;
}
