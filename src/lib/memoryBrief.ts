/* ============================================================================
 * memoryBrief.ts — how a learner is described to a model. One implementation.
 *
 * Memory used to reach exactly one surface. `services/ai` referenced `Memory`
 * only inside rollup and consolidate, and both treat it as material to edit
 * rather than context to reason with — so the card writer, the recall marker
 * and the exam generator all worked with no idea who they were writing for.
 * This is the one brief they all share.
 *
 * There were then *two* of them. This one, and the header that chatContext
 * built for chat: the same "=== CONTEXT ON THIS LEARNER ===" banner, the same
 * goals sentence, the same memory lines, assembled by different code — so a
 * change to how a learner is described landed in one path and not the other,
 * and chat and the review loop could describe the same person differently.
 * `learnerBlocks()` is the single answer now, and both compose it: this module
 * wraps it alone, buildContext appends its per-source blocks and wraps once.
 *
 * It lives here rather than in chatContext.ts because services/ai is in the
 * main bundle and chatContext drags in dayBrief and the deck machinery with
 * it; the review loop should not pay for that. `poolFor` moved down here for
 * the same reason — one implementation, in the lighter module, with
 * chatContext importing it rather than the other way round.
 * ========================================================================== */
import * as store from "@/services/store";
import * as memoryStore from "@/services/memoryStore";
import { retrieve } from "@/lib/memoryRetrieval";
import { gapsFrom, renderGaps } from "@/lib/gaps";
import type { Memory, MemoryScope } from "@/types";

/** The candidate set a memory source draws from, before scoring.
 *
 *  Takes `projectId` explicitly rather than reading the globally-active
 *  project: the settings panel previews retrieval for a specific
 *  conversation, and a preview that can disagree with what actually gets sent
 *  is worse than no preview at all. */
export function poolFor(scope: MemoryScope | "both", projectId: string): Memory[] {
  const active = memoryStore.all().filter((m) => m.active);
  if (scope === "global") return active.filter((m) => m.scope === "global");
  if (scope === "project") return active.filter((m) => m.scope === "project" && m.projectId === projectId);
  return active.filter((m) => m.scope === "global" || (m.scope === "project" && m.projectId === projectId));
}

/** One memory, rendered the way every surface renders it. Chat and non-chat
 *  must not be able to phrase this differently. */
export function memoryLine(m: Memory): string {
  return `- (${m.type}${m.pinned ? ", pinned" : ""}) ${m.text}`;
}

export interface BriefOpts {
  /** What to score against — the card front, the topic, the message. An empty
   *  query still returns the highest-scoring memories by type and recency. */
  queryText?: string;
  projectId?: string;
  scope?: MemoryScope | "both";
  limit?: number;
  maxChars?: number;
  /** Include the project's stated goals. On by default: `core.ts:74` says
   *  goals are "injected verbatim on every turn", and until now exactly one
   *  function read them. */
  goals?: boolean;
  /** Include retrieved memory. Off for callers that already carry their own
   *  memory list in the user message and only need the goals header. */
  memories?: boolean;
  /** Include what the learner is currently getting wrong, computed from the
   *  marker's diagnoses in the review log. On by default: it is the most
   *  actionable thing this app knows about anybody, and every entry point
   *  that writes, marks, tests or teaches should be aiming at it. Off for the
   *  extraction passes, which read context to avoid duplicating it rather
   *  than to think with it. */
  gaps?: boolean;
  /** Count this injection as a use. Off for previews and for the extraction
   *  pass, which reads memory to avoid duplicating it rather than to think
   *  with it. */
  recordUse?: boolean;
}

export interface Brief {
  /** Ready to prepend to a system prompt, or "" when there is nothing to say.
   *  An empty "here is what is known:" heading is worse than silence. */
  text: string;
  picked: Memory[];
}

/** How many recurring confusions to name. Long enough to be a picture, short
 *  enough that a model aims at them rather than triaging them. */
const MAX_GAPS = 5;

/**
 * The blocks that describe a learner, without the wrapper — what they are
 * working toward, what they are currently getting wrong, and what is
 * remembered about them.
 *
 * Exported because chat assembles its prompt differently (it appends
 * per-source blocks and applies three separate caps to memory) and used to
 * grow a second copy of this description rather than share one. Anything that
 * changes how a learner is described belongs here and nowhere else.
 */
export function learnerBlocks(opts: BriefOpts = {}): { blocks: string[]; picked: Memory[] } {
  const db = store.get();
  const projectId = opts.projectId ?? db.activeProjectId;
  const project = db.projects[projectId];

  const picked =
    opts.memories === false
      ? []
      : retrieve(poolFor(opts.scope ?? "both", projectId), {
          queryText: opts.queryText || "",
          limit: opts.limit ?? 8,
          maxChars: opts.maxChars
        }).picked;

  const blocks: string[] = [];

  const goals = (project?.goals || "").trim();
  if (opts.goals !== false && goals) {
    blocks.push("What this learner is trying to achieve on this project:\n" + goals);
  }

  /* Computed from the review log on every build, never stored: a confusion
     that has stopped recurring stops being mentioned, which is the whole
     reason this is derived rather than written into memory. */
  if (opts.gaps !== false) {
    const gaps = gapsFrom(store.logOf(store.decksOf(projectId)), { limit: MAX_GAPS });
    if (gaps.length) {
      blocks.push(
        "What they are currently getting wrong, from marking their recall attempts:\n" +
          renderGaps(gaps) +
          "\nAim at these where it is relevant. Do not read the list back to them."
      );
    }
  }

  if (picked.length) {
    blocks.push("What is known about this learner, from memory:\n" + picked.map(memoryLine).join("\n"));
  }

  if (opts.recordUse) for (const m of picked) memoryStore.recordUsage(m.id);
  return { blocks, picked };
}

/** The one banner. Both brief builders emit exactly this, so a model is never
 *  shown two different framings of the same person in one session. */
export function wrapLearner(blocks: string[]): string {
  return (
    "=== CONTEXT ON THIS LEARNER ===\n" +
    blocks.join("\n\n") +
    "\n=== END CONTEXT ===\n" +
    "Use this to pitch your answer at them. Do not recite it back or mention that you were given it.\n"
  );
}

/**
 * Build the shared context block. Callers prepend `.text` to their system
 * prompt; `.picked` is returned so a caller can show what was used.
 */
export function memoryBrief(opts: BriefOpts = {}): Brief {
  const { blocks, picked } = learnerBlocks(opts);
  if (!blocks.length) return { text: "", picked: [] };
  return { text: wrapLearner(blocks) + "\n", picked };
}
