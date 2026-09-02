/* ============================================================================
 * dayBrief.ts — the day, assembled from everywhere at once.
 *
 * This is the block that makes the tutor a notebook rather than a chat
 * window. Every other context source in chatContext.ts is a *category* of
 * thing — a deck, the weak cards, the memory store. This one is a moment, and
 * it is the reason "what did I learn today?" is answerable at all:
 *
 *   · the journal source only sees entries that have been through the
 *     narrative step, so a day of raw capture was invisible;
 *   · nothing else in the app has ever put the review log into a prompt, so
 *     what was graded — and what the learner actually wrote when tested —
 *     never reached the model at all.
 *
 * Both are read here. The recall attempts are the valuable part: a grade says
 * you got it wrong, the sentence you wrote says how you were thinking, and
 * that is what a tutor would want to see.
 *
 * Everything is capped, because this block goes out on every message.
 * ========================================================================== */
import * as store from "@/services/store";
import * as journalStore from "@/services/journalStore";
import * as memoryStore from "@/services/memoryStore";
import * as U from "@/lib/util";
import type { Grade } from "@/types";

const MAX_TROUBLE = 12;
const MAX_ATTEMPTS = 8;
const MAX_ITEMS = 10;

/** How much of a card's back to quote. The front alone is often a bare
 *  symbol — "m", "x⁽ⁱ⁾" — which tells the model nothing about what was
 *  actually being asked, so the answer comes along with it. */
const BACK_MAX = 180;

/** A logged card as "front → back", or null when the entry predates card ids
 *  or the card has since been deleted. Never throws: a brief that blew up on
 *  one stale id would take the whole send with it. */
function cardOf(deckId: string, cardId: string | undefined): string | null {
  if (!cardId) return null;
  const d = store.get().decks[deckId];
  const c = d?.cards.find((x) => x.id === cardId);
  if (!c) return null;
  const front = U.stripTags(c.q);
  const back = U.stripTags(c.a);
  if (!back) return front;
  return `${front} → ${back.length > BACK_MAX ? back.slice(0, BACK_MAX) + "…" : back}`;
}

/**
 * Ordered the way a tutor would ask: what did you struggle with, what did you
 * say, what did you write down, what did you make.
 *
 * Returns null when the day is genuinely empty — a brief full of "nothing"
 * headings teaches the model to skim the whole block.
 */
export function renderToday(projectId: string, days = 1): string | null {
  const db = store.get();
  const decks = store.decksOf(projectId);
  const deckIds = new Set(decks.map((d) => d.id));

  const midnight = new Date().setHours(0, 0, 0, 0);
  const from = midnight - (Math.max(1, days) - 1) * U.DAY;
  const when = days === 1 ? "today" : `over the last ${days} days`;

  const entries = db.log.filter((e) => e.t >= from && deckIds.has(e.d));
  const parts: string[] = [];

  /* ---- how the reviewing went ---- */
  if (entries.length) {
    const failed = entries.filter((e) => e.g === 1);
    const hard = entries.filter((e) => e.g === 2);
    const clean = entries.length - failed.length - hard.length;
    let block =
      `Reviewed ${entries.length} card${entries.length === 1 ? "" : "s"} ${when}: ` +
      `${clean} recalled cleanly, ${hard.length} with difficulty, ${failed.length} not at all.`;

    const trouble = [...failed, ...hard]
      .map((e) => ({ grade: e.g, front: cardOf(e.d, e.c) }))
      .filter((x): x is { grade: Grade; front: string } => !!x.front)
      .slice(0, MAX_TROUBLE);
    if (trouble.length) {
      block +=
        "\nThe ones that did not go well:\n" +
        trouble.map((x) => `- [${x.grade === 1 ? "failed" : "hard"}] ${x.front}`).join("\n");
    }
    parts.push(block);
  }

  /* ---- what they wrote from memory ---- */
  const attempts = entries.filter((e) => e.a).slice(-MAX_ATTEMPTS).reverse();
  if (attempts.length) {
    parts.push(
      "What they wrote from memory when tested, in their own words. This is the best evidence you have of how " +
        "they are actually thinking:\n" +
        attempts
          .map((e) => {
            const front = cardOf(e.d, e.c) || "a card";
            const verdict = e.v ? ` (marked ${e.v})` : "";
            return `- The card: ${front}\n  They wrote${verdict}: "${e.a}"`;
          })
          .join("\n")
    );
  }

  /* ---- what they wrote down, summarised or not ---- */
  const journalEntries = journalStore
    .listForProject(projectId)
    .filter((e) => e.created >= from || e.updated >= from)
    .slice(0, 2);
  for (const e of journalEntries) {
    const bits: string[] = [];
    if (e.summary) {
      if (e.summary.narrative) bits.push(e.summary.narrative);
      if (e.summary.learned.length) bits.push(`Learned: ${e.summary.learned.join("; ")}.`);
      if (e.summary.stuck.length) bits.push(`Stuck on: ${e.summary.stuck.join("; ")}.`);
      if (e.summary.open.length) bits.push(`Left open: ${e.summary.open.join("; ")}.`);
    } else if (e.raw.length) {
      /* Raw captures matter precisely because they have not been through the
         narrative step. Without this, a day of writing stays invisible until
         the learner remembers to press a button. */
      bits.push(
        "Not written up yet. Raw notes as they were captured:\n" +
          e.raw
            .slice(-MAX_ITEMS)
            .map((r) => `  · ${r.text}`)
            .join("\n")
      );
    }
    if (bits.length) parts.push(`Their journal for ${e.day}:\n${bits.join(" ")}`);
  }

  /* ---- what they made ---- */
  const madeCards: string[] = [];
  for (const d of decks) {
    for (const c of d.cards) {
      if (c.created && c.created >= from) madeCards.push(U.stripTags(c.q));
    }
  }
  if (madeCards.length) {
    parts.push(
      `Cards written ${when} (${madeCards.length}):\n` +
        madeCards
          .slice(0, MAX_ITEMS)
          .map((q) => `- ${q}`)
          .join("\n")
    );
  }

  const fresh = memoryStore
    .list({ scope: "project", projectId, activeOnly: true })
    .filter((m) => m.created >= from);
  if (fresh.length) {
    parts.push(
      `Committed to memory ${when}:\n` +
        fresh
          .slice(0, MAX_ITEMS)
          .map((m) => `- (${m.type}) ${m.text}`)
          .join("\n")
    );
  }

  if (!parts.length) return null;

  return (
    `The learner's day so far (${U.today()}):\n\n` +
    parts.join("\n\n") +
    "\n\nWhen they ask what they did or learned, answer from this — concretely, naming the actual cards and " +
    "quoting their own words back where it helps. You do have this information; never tell them you have no way " +
    "of knowing what they did."
  );
}
