/* ============================================================================
 * effort.ts — what "low / medium / high" actually costs.
 *
 * Effort has been settable at three scopes since the settings panel was
 * written, resolved with full provenance by lib/resolveSetting.ts, and read by
 * nothing at all. A dial that turns and changes nothing is worse than no dial:
 * it makes you think you have tuned something.
 *
 * This is the one place that gives it meaning, so there is exactly one answer
 * to "what does high do". Three things move, and they are the three that
 * actually decide what a message costs:
 *
 *   how much of the conversation goes back up the wire
 *   how many memories are retrieved
 *   how long the reply is allowed to be
 *
 * A fourth follows from it: at low effort the app stops making the extra
 * follow-up-suggestion request entirely, because "cheap" should mean one
 * request, not one and a bit.
 * ========================================================================== */
import type { Effort } from "@/types/core";

export interface EffortBudget {
  /** How many of the most recent turns are sent. Infinity sends the lot. */
  historyTurns: number;
  /** Cap on memories injected, overriding a memory source's own limit. */
  memoryLimit: number;
  /** Multiplier on the conversation's own maxTokens for the reply. */
  replyScale: number;
  /** Whether the second, cheaper follow-up request is worth making. */
  followups: boolean;
  /** One line for the chip's tooltip, in plain words. */
  blurb: string;
}

export const EFFORT_BUDGETS: Record<Effort, EffortBudget> = {
  low: {
    historyTurns: 6,
    memoryLimit: 3,
    replyScale: 0.5,
    followups: false,
    blurb: "Short memory, brief answers, one request per message."
  },
  medium: {
    historyTurns: 24,
    memoryLimit: 8,
    replyScale: 1,
    followups: true,
    blurb: "The working default: recent history, eight memories, full-length answers."
  },
  high: {
    historyTurns: Number.POSITIVE_INFINITY,
    memoryLimit: 16,
    replyScale: 2,
    followups: true,
    blurb: "The whole conversation, twice the memory, room for a long answer. Costs the most."
  }
};

export const EFFORT_ORDER: Effort[] = ["low", "medium", "high"];

export function budgetFor(effort: Effort): EffortBudget {
  return EFFORT_BUDGETS[effort] || EFFORT_BUDGETS.medium;
}
