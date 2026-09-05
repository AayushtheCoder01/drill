/* ============================================================================
 * EffortChip — how hard this message should try, in the bar where you type it.
 *
 * Effort belongs next to the send button for the same reason the model does:
 * it is a per-message decision, not a preference. You ask something small,
 * then something that needs the whole conversation in front of it, and the
 * choice is made while you are writing — not in a settings panel you opened
 * an hour ago.
 *
 * Each option says what it actually does (lib/effort.ts), because until now
 * effort was a dial that turned and changed nothing, and the fix for that is
 * not a nicer label.
 * ========================================================================== */
import { useEffect, useRef, useState } from "react";
import * as store from "@/services/store";
import * as chatStore from "@/services/chatStore";
import { EFFORT_ORDER, effortMeans } from "@/lib/effort";
import { resolveEffort } from "@/lib/resolveSetting";
import type { ChatMode, Conversation } from "@/types/chat";
import type { Effort } from "@/types/core";
import Icon from "../ui/Icon";

export default function EffortChip({
  conversation,
  draftEffort,
  onDraftEffort,
  draftMode
}: {
  /** Null on the empty screen, before a conversation exists to pin it to. */
  conversation: Conversation | null;
  draftEffort: Effort | "";
  onDraftEffort: (e: Effort | "") => void;
  /** The mode selected on the empty screen, so this chip can describe what
   *  effort buys there too rather than assuming Direct. */
  draftMode: ChatMode;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const project = conversation ? store.get().projects[conversation.projectId] : null;
  const chosen = conversation ? conversation.effort : draftEffort;
  const resolved = conversation
    ? resolveEffort(conversation, project)
    : { value: (draftEffort || store.settings().effort) as Effort, origin: draftEffort ? "conversation" : "global" };

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function choose(e: Effort | "") {
    if (conversation) {
      conversation.effort = e;
      chatStore.persist(conversation, true);
    } else {
      onDraftEffort(e);
    }
    setOpen(false);
  }

  /* What effort buys *in the mode currently selected*. The two chips sit next
     to each other and both read as cost dials, so a tooltip promising "up to
     three lookups" while the thread was on Direct — which makes none — was the
     app contradicting itself inside the composer.

     Falls back to the draft, not to "direct": on the empty screen there is no
     conversation to read, so reading only `conversation?.mode` made this chip
     describe Direct while the mode chip beside it clearly said Deep. */
  const raw = conversation ? conversation.mode : draftMode;
  const mode = raw === "agent" || raw === "deep" ? raw : "direct";

  return (
    <div className="modelchip" ref={boxRef}>
      <button
        className="cbtn ghost modelchip-btn"
        onClick={() => setOpen((v) => !v)}
        title={`${resolved.value} effort — ${effortMeans(resolved.value, mode)}`}
      >
        <span className={"modelchip-dot" + (chosen ? " pinned" : "")} />
        <span className="modelchip-name">{resolved.value}</span>
        <Icon name="chevron" size={11} />
      </button>

      {open && (
        <div className="modelpop">
          <div className="modelpop-head">
            <span>Effort {conversation ? "for this conversation" : "for the next conversation"}</span>
            {chosen && (
              <button className="modelpop-clear" onClick={() => choose("")}>
                use the default
              </button>
            )}
          </div>
          <div className="effortlist">
            {EFFORT_ORDER.map((e) => (
              <button
                key={e}
                className={"effortrow" + (e === resolved.value ? " on" : "")}
                onClick={() => choose(e)}
              >
                <span className="effortrow-n">{e}</span>
                <span className="effortrow-b">{effortMeans(e, mode)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
