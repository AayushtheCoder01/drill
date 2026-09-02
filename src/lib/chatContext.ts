/* ============================================================================
 * chatContext.ts — turning what you have studied into something the model can
 * read.
 *
 * This is the reason the chat lives inside Drill instead of in a browser tab
 * pointed at openrouter.ai. A tutor that can see which cards you keep failing
 * gives different, better answers than one that cannot.
 *
 * Context is rebuilt at send time rather than frozen into the transcript, so
 * a conversation you come back to next week reflects next week's weak spots.
 * Everything is capped: blowing the context window on card dumps would push
 * out the actual conversation.
 * ========================================================================== */
import * as store from "@/services/store";
import * as memoryStore from "@/services/memoryStore";
import * as journalStore from "@/services/journalStore";
import * as U from "@/lib/util";
import { retrieve, type RetrievalTrace } from "@/lib/memoryRetrieval";
import { renderToday } from "@/lib/dayBrief";
import type { ContextSource } from "@/types/chat";
import type { Card, Deck, Memory, MemoryScope, SRSState } from "@/types";

const MAX_CARDS = 60;
const MAX_NOTES = 25;
const MAX_JOURNAL_ENTRIES = 14;

function cardLine(c: Card, st?: SRSState): string {
  const front = U.stripTags(c.q);
  const back = U.stripTags(c.a);
  let flag = "";
  if (st && st.reps) {
    if (store.isLeech(st)) flag = ` [FAILING — ${st.lapses} lapses]`;
    else if (st.lapses > 0) flag = ` [${st.lapses} lapses]`;
  } else {
    flag = " [not yet seen]";
  }
  return `- (${c.tag})${flag} ${front} => ${back}`;
}

function deckBlock(d: Deck, cards: Card[], heading: string): string {
  const shown = cards.slice(0, MAX_CARDS);
  const lines = shown.map((c) => cardLine(c, d.srs[c.id]));
  const more = cards.length > shown.length ? `\n…and ${cards.length - shown.length} more not listed.` : "";
  return `${heading}\n${lines.join("\n")}${more}`;
}

/** Cards the learner is measurably worst at: leeches first, then the lowest
 *  stability among cards actually in review. Cards never seen are excluded —
 *  not knowing something you have not studied is not a weak spot. */
function weakCards(d: Deck): Card[] {
  const scored = d.cards
    .map((c) => ({ c, st: d.srs[c.id] }))
    .filter((x) => x.st && x.st.reps)
    .sort((a, b) => {
      const leechDelta = Number(store.isLeech(b.st!)) - Number(store.isLeech(a.st!));
      if (leechDelta) return leechDelta;
      const lapseDelta = (b.st!.lapses || 0) - (a.st!.lapses || 0);
      if (lapseDelta) return lapseDelta;
      return a.st!.S - b.st!.S;
    });
  return scored.slice(0, MAX_CARDS).map((x) => x.c);
}

function dueCards(d: Deck): Card[] {
  const now = Date.now();
  return d.cards.filter((c) => {
    const st = d.srs[c.id];
    return st && st.reps && st.due <= now;
  });
}

/** The candidate set a memory source draws from, before scoring.
 *
 *  One implementation, taking `projectId` explicitly rather than reading the
 *  globally-active project: the settings panel previews retrieval for a
 *  specific conversation, and a preview that can disagree with what actually
 *  gets sent is worse than no preview at all. */
export function poolFor(scope: MemoryScope | "both", projectId: string): Memory[] {
  const active = memoryStore.all().filter((m) => m.active);
  if (scope === "global") return active.filter((m) => m.scope === "global");
  if (scope === "project") return active.filter((m) => m.scope === "project" && m.projectId === projectId);
  return active.filter((m) => m.scope === "global" || (m.scope === "project" && m.projectId === projectId));
}

/** Score a memory source and return the full trace — the picked set plus every
 *  candidate and why it scored what it did. The settings panel renders the
 *  trace; the send path uses `.picked`. */
export function retrieveForSource(src: ContextSource, queryText: string, projectId: string): RetrievalTrace | null {
  if (src.kind !== "memory") return null;
  return retrieve(poolFor(src.scope, projectId), { queryText, limit: src.limit || 8 });
}

/** Which memories a `{kind:"memory"}` source would inject right now. */
export function memoriesForSource(src: ContextSource, queryText: string, projectId: string): Memory[] {
  return retrieveForSource(src, queryText, projectId)?.picked ?? [];
}

/** Render one context source. Returns null when there is nothing to say —
 *  an empty "here are your weak cards:" heading is worse than silence.
 *  `queryText` (typically the message being sent) steers what memory gets
 *  pulled in; sources that ignore it just don't use the argument. */
export interface RenderOpts {
  /** Whose project this is. Defaults to the globally-active one. */
  projectId?: string;
  /** Memory already retrieved for this source, so it is not scored twice. */
  memories?: Memory[];
}

export function renderSource(src: ContextSource, queryText = "", opts: RenderOpts = {}): string | null {
  const db = store.get();
  const projectId = opts.projectId ?? db.activeProjectId;

  if (src.kind === "memory") {
    /* `picked` may be handed in by buildContext, which has already scored this
       source once. Retrieval is not idempotent — recordUsage runs between the
       two calls and moves useCount — so scoring twice per send could inject
       one set and record usage against another. */
    const picked = opts.memories ?? memoriesForSource(src, queryText, projectId);
    if (!picked.length) return null;
    const lines = picked.map((m) => `- (${m.type}${m.pinned ? ", pinned" : ""}) ${m.text}`);
    return (
      `What is known about this learner${src.scope === "project" ? " on this project" : ""}, from memory:\n` +
      lines.join("\n")
    );
  }

  if (src.kind === "knowledge") {
    const items = (db.projects[projectId]?.knowledge || []).filter((k) => k.enabled);
    if (!items.length) return null;
    return (
      "Reference material attached to this project:\n\n" +
      items.map((k) => `--- ${k.name} ---\n${k.text}`).join("\n\n")
    );
  }

  if (src.kind === "journal") {
    const cutoff = Date.now() - Math.max(1, src.days) * U.DAY;
    const entries = journalStore
      .listForProject(projectId)
      .filter((e) => e.summary && e.created >= cutoff)
      .slice(0, MAX_JOURNAL_ENTRIES);
    if (!entries.length) return null;
    const lines = entries.map((e) => {
      const s = e.summary!;
      const bits = [s.narrative];
      if (s.stuck.length) bits.push(`Stuck on: ${s.stuck.join("; ")}.`);
      if (s.open.length) bits.push(`Still open: ${s.open.join("; ")}.`);
      return `- (${e.day}) ${bits.join(" ")}`;
    });
    return (
      `The learner's journal from the last ${src.days} days:\n` +
      lines.join("\n") +
      "\n\nBuild on what they already worked through rather than re-teaching it."
    );
  }

  if (src.kind === "deck") {
    const d = db.decks[src.deckId];
    if (!d || !d.cards.length) return null;
    const seen = d.cards.filter((c) => d.srs[c.id]?.reps).length;
    return deckBlock(
      d,
      d.cards,
      `The learner is studying a deck called "${d.name}" (${d.cards.length} cards, ${seen} seen). ` +
        `These are the cards in it, with how they are doing on each:`
    );
  }

  if (src.kind === "weak") {
    const decks = src.deckId ? [db.decks[src.deckId]].filter(Boolean) : Object.values(db.decks);
    const parts: string[] = [];
    for (const d of decks) {
      const weak = weakCards(d);
      if (weak.length) parts.push(deckBlock(d, weak, `Cards from "${d.name}" the learner is struggling with most:`));
    }
    if (!parts.length) return null;
    return (
      parts.join("\n\n") +
      "\n\nWhen it is relevant, aim your explanations at these gaps rather than at the topic in general."
    );
  }

  if (src.kind === "due") {
    const decks = src.deckId ? [db.decks[src.deckId]].filter(Boolean) : store.pool();
    const parts: string[] = [];
    for (const d of decks) {
      const due = dueCards(d);
      if (due.length) parts.push(deckBlock(d, due, `Cards from "${d.name}" that are due for review right now:`));
    }
    return parts.length ? parts.join("\n\n") : null;
  }

  if (src.kind === "today") {
    const block = renderToday(projectId, Math.max(1, src.days || 1));
    return block;
  }

  if (src.kind === "notes") {
    const notes = (db.notes || []).slice(-Math.min(src.limit || MAX_NOTES, MAX_NOTES)).reverse();
    if (!notes.length) return null;
    const lines = notes.map((n) => `- (${n.tag || "note"}, ${U.ago(n.t)}) ${n.text}`);
    return (
      "The learner keeps an insight log — things that clicked, written in their own words. " +
      "Their most recent entries:\n" +
      lines.join("\n") +
      "\n\nThese show how they think about the material. Build on their framing where you can."
    );
  }

  return null;
}

export interface BuiltContext {
  /** The full system message: persona, then whatever context is attached. */
  system: string;
  /** Exactly the memories that went into `system`, so the caller can record
   *  usage against what was actually sent rather than re-deriving it. */
  memories: Memory[];
}

/** Build the system message for one send, scoring every memory source exactly
 *  once. `queryText` — usually the message about to go out — is what a memory
 *  source scores against.
 *
 *  Handing the memories back alongside the prompt is the point. The caller used
 *  to retrieve once for usage telemetry and again to build the prompt, with
 *  recordUsage mutating scores in between — so the two passes could disagree
 *  about what had been sent, and usage was logged against memories the model
 *  never saw. */
export function buildContext(
  persona: string,
  sources: ContextSource[],
  queryText: string,
  projectId: string,
  /** Cap from the effort budget. Overrides each memory source's own limit,
   *  which is what makes "low effort" mean something concrete rather than
   *  being a label. */
  memoryLimit?: number
): BuiltContext {
  const memories: Memory[] = [];
  const blocks = sources
    .map((s) => {
      if (s.kind !== "memory") return renderSource(s, queryText, { projectId });
      const capped = memoryLimit == null ? s : { ...s, limit: Math.min(s.limit || 8, memoryLimit) };
      const picked = memoriesForSource(capped, queryText, projectId);
      memories.push(...picked);
      return renderSource(capped, queryText, { projectId, memories: picked });
    })
    .filter((b): b is string => !!b);

  if (!blocks.length) return { system: persona, memories };
  const context =
    "=== CONTEXT ON THIS LEARNER ===\n" +
    blocks.join("\n\n") +
    "\n=== END CONTEXT ===\n\n" +
    "Use this to pitch your answers correctly. Do not recite it back at them or mention that you were " +
    "given it unless they ask what you can see.";
  return { system: persona ? persona + "\n\n" + context : context, memories };
}

/** A short human label for the context chip in the composer. */
export function describeSource(src: ContextSource): string {
  const db = store.get();
  if (src.kind === "deck") return db.decks[src.deckId]?.name || "deck";
  if (src.kind === "weak") return src.deckId ? `weak · ${db.decks[src.deckId]?.name || "deck"}` : "weak spots";
  if (src.kind === "due") return src.deckId ? `due · ${db.decks[src.deckId]?.name || "deck"}` : "due now";
  if (src.kind === "memory") return src.scope === "both" ? "memory" : `memory · ${src.scope}`;
  if (src.kind === "knowledge") return "project files";
  if (src.kind === "journal") return `journal · ${src.days}d`;
  if (src.kind === "today") return src.days && src.days > 1 ? `today · ${src.days}d` : "today";
  return "insight log";
}

/** Rough size of the attached context, so the composer can warn before it
 *  eats the window. */
export function sourceSize(src: ContextSource, queryText = "", projectId?: string): number {
  return (renderSource(src, queryText, { projectId }) || "").length;
}
