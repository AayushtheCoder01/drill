/* ============================================================================
 * chatActions.ts — things a conversation can be told to do, per backend.
 *
 * The first is web search. It is written as a registry rather than a boolean
 * because more will follow, and because support is a property of the
 * *backend*, not of the app: OpenRouter runs search server-side, Ollama
 * cannot, and a toggle that silently does nothing on half the backends is the
 * dead-dial problem again.
 *
 * A backend declares what it supports (`BackendDef.supports`); an action
 * declares how to apply itself to a request body. Adding a second action
 * means one entry here and one entry in the backend's `supports` list —
 * nothing in the composer or the send path needs to change.
 *
 * Every action must be a single-request feature. START-HERE §2.2 is "pipeline,
 * not agent loop, one API call per operation", and OpenRouter's web plugin
 * honours that: their servers run the search and inject the results as prompt
 * text, so the model answers in the same completion. If an action would need
 * a second round trip, it does not belong here — it belongs in Phase 8.
 * ========================================================================== */
import type { BackendType } from "@/types";

export type ChatActionId = "web";

export interface ChatAction {
  id: ChatActionId;
  /** The chip's label in the composer. */
  label: string;
  /** Shown when it is on, and in the tooltip. Plain words, no jargon. */
  blurb: string;
  /** Said when the current backend cannot do it, so the disabled chip can
   *  explain itself instead of just being grey. */
  unsupported: string;
  /** Mutate the outgoing request body. Called only when the action is both
   *  enabled and supported. */
  apply(body: Record<string, unknown>): void;
}

export const CHAT_ACTIONS: Record<ChatActionId, ChatAction> = {
  web: {
    id: "web",
    label: "Web",
    blurb: "Searches the web and answers from what it finds, with sources.",
    unsupported: "Only OpenRouter can search the web. Switch backend in Settings to use this.",
    apply(body) {
      /* The plugin form rather than the `model:online` suffix: the suffix
         would have to be spliced into the model id, which then no longer
         matches the pricing catalogue or the model picker. */
      body.plugins = [{ id: "web" }];
    }
  }
};

export const ACTION_ORDER: ChatActionId[] = ["web"];

export function isActionId(v: unknown): v is ChatActionId {
  return typeof v === "string" && v in CHAT_ACTIONS;
}

/** What this backend can do. Unknown backend ids support nothing, which is
 *  the safe direction: a chip that is wrongly disabled is a nuisance, one
 *  that is wrongly enabled sends a request the backend rejects. */
export function supportedBy(supports: ChatActionId[] | undefined, id: ChatActionId): boolean {
  return !!supports && supports.includes(id);
}
