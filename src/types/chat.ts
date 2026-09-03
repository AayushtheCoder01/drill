/* ============================================================================
 * chat.ts — the chat platform's data model.
 *
 * A conversation is a flat list of turns. Assistant turns carry *variants*
 * (one per regeneration) rather than the app keeping a message tree: the
 * cases people actually use are "give me that again" and "take this
 * somewhere else", and the second is served by branching into a new
 * conversation instead of an invisible tree node.
 * ========================================================================== */
import type { BackendType, TokenUsage } from "@/types";
import type { Effort, MemoryScope } from "@/types/core";

/** Re-exported so chat code has one import for its own vocabulary. */
export type Usage = TokenUsage;

export type TurnRole = "user" | "assistant";

/** A file or snippet pulled into a turn. The text is inlined into the wire
 *  message when sending; this record exists so the UI can show a chip and so
 *  an edited turn can be rebuilt without re-reading the file. */
export interface Attachment {
  id: string;
  name: string;
  kind: "file" | "selection" | "card" | "note" | "deck";
  /** bytes for files, characters otherwise — for the chip's subtitle */
  size: number;
  text: string;
}

/** What a save-to-memory request did, recorded on the turn that caused it so
 *  the result is still there after a reload. Compact on purpose: the live
 *  state of a queued item is read back from the candidate tray, not frozen
 *  here, so accepting one elsewhere does not leave this block lying. */
export interface SavedMemory {
  committed: { id: string; text: string; type: string }[];
  queued: { id: string; text: string; type: string; supersedes: string | null }[];
  /** Dropped as duplicates — shown so "nothing saved" never looks like a bug. */
  skipped: { text: string; existingText: string }[];
  atCap: boolean;
}

/** One generation of an assistant turn, or one edit of a user turn. */
export interface Variant {
  content: string;
  model?: string;
  usage?: Usage;
  /** ms spent streaming, for the "12.4s · 830 tok" footer */
  elapsed?: number;
  createdAt: number;
  /** Present when this reply saved something to memory. */
  saved?: SavedMemory;
}

export interface Turn {
  id: string;
  role: TurnRole;
  variants: Variant[];
  /** index into variants */
  active: number;
  attachments?: Attachment[];
  /** set when the request failed; the turn stays so it can be retried */
  error?: string;
  /** user marked this worth keeping */
  starred?: boolean;
  createdAt: number;
}

/** What the app injects ahead of the user's own messages. Recomputed at send
 *  time, never frozen into the transcript, so it tracks your actual progress. */
export type ContextSource =
  | { kind: "deck"; deckId: string }
  | { kind: "weak"; deckId: string | null }
  | { kind: "notes"; limit: number }
  | { kind: "due"; deckId: string | null }
  /** Retrieved memory. Live like the rest: scored fresh at send time, so a
   *  conversation reopened next month reflects what is known by then. */
  | { kind: "memory"; scope: MemoryScope | "both"; limit: number }
  /** The project's always-attached files and text. */
  | { kind: "knowledge" }
  /** The last `days` days of journal entries for this project. */
  | { kind: "journal"; days: number }
  /**
   * Today, assembled from everywhere at once: what was reviewed and how it
   * went, the sentences the learner actually wrote when recalling, cards and
   * memories written, and anything captured in the journal — summarised or
   * not.
   *
   * Every other source is a *category* of thing. This one is a moment, and it
   * is the source that makes "what did I learn today?" answerable at all: the
   * journal source only sees entries that have been through the narrative
   * step, and nothing else in this list has ever seen the review log.
   */
  | { kind: "today"; days?: number };

export interface Conversation {
  id: string;
  /** Which project this belongs to. Set on create; older records are filed
   *  under the active project by chatStore.repair(). */
  projectId: string;
  title: string;
  /** false until the model has named it, so an in-flight title does not flash */
  titled: boolean;
  created: number;
  updated: number;
  pinned: boolean;
  archived: boolean;

  backend: BackendType | "";
  model: string;
  personaId: string;
  /** overrides the persona's prompt when non-empty */
  systemPrompt: string;
  temperature: number;
  maxTokens: number;

  /** "" means inherit from the project, which may inherit from global. */
  effort: Effort | "";

  context: ContextSource[];
  /** Attachments that survive every turn, as opposed to Turn.attachments
   *  which are sent once. Pinning is the difference between paying for a file
   *  once and paying for it on every message. */
  pinnedAttachments: Attachment[];
  turns: Turn[];
  usage: Usage;

  /** Index of the last turn already folded into memory by a wrap-up, so
   *  running wrap-up again covers only what has been said since. */
  rolledUpThrough: number;
}

/** The sidebar reads these without loading full transcripts. */
export interface ConversationMeta {
  id: string;
  /** Lets the sidebar filter to the active project without loading transcripts. */
  projectId: string;
  title: string;
  titled: boolean;
  created: number;
  updated: number;
  pinned: boolean;
  archived: boolean;
  model: string;
  turnCount: number;
  /** first ~120 chars of the last turn, for the list subtitle */
  preview: string;
}

export interface Persona {
  id: string;
  name: string;
  blurb: string;
  prompt: string;
  /** built-ins cannot be deleted, only copied */
  builtin: boolean;
  /** suggested default; the conversation can still override */
  temperature?: number;
}

/** Model pricing, per million tokens, when the backend publishes it. */
export interface ModelPrice {
  id: string;
  prompt: number;
  completion: number;
  contextLength?: number;
  name?: string;
}
