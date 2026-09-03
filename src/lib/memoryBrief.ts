/* ============================================================================
 * memoryBrief.ts — what the learner is known to think, for any AI call.
 *
 * Memory used to reach exactly one surface. `services/ai` referenced `Memory`
 * only inside rollup and consolidate, and both treat it as material to edit
 * rather than context to reason with — so the card writer, the recall marker
 * and the exam generator all worked with no idea who they were writing for.
 * This is the one brief they all share.
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

/**
 * Build the shared context block. Callers prepend `.text` to their system
 * prompt; `.picked` is returned so a caller can show what was used.
 */
export function memoryBrief(opts: BriefOpts = {}): Brief {
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

  const parts: string[] = [];

  const goals = (project?.goals || "").trim();
  if (opts.goals !== false && goals) {
    parts.push("What this learner is trying to achieve on this project:\n" + goals);
  }
  if (picked.length) {
    parts.push("What is known about this learner, from memory:\n" + picked.map(memoryLine).join("\n"));
  }

  if (!parts.length) return { text: "", picked: [] };

  if (opts.recordUse) for (const m of picked) memoryStore.recordUsage(m.id);

  return {
    text:
      "=== CONTEXT ON THIS LEARNER ===\n" +
      parts.join("\n\n") +
      "\n=== END CONTEXT ===\n" +
      "Use this to pitch your answer at them. Do not recite it back or mention that you were given it.\n\n",
    picked
  };
}
