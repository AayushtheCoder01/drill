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
import { EFFORT_BUDGETS, EFFORT_ORDER } from "@/lib/effort";
import { resolveEffort } from "@/lib/resolveSetting";
import type { Conversation } from "@/types/chat";
import type { Effort } from "@/types/core";
import Icon from "../ui/Icon";

export default function EffortChip({
  conversation,
  draftEffort,
  onDraftEffort
}: {
  /** Null on the empty screen, before a conversation exists to pin it to. */
  conversation: Conversation | null;
  draftEffort: Effort | "";
  onDraftEffort: (e: Effort | "") => void;
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

  const budget = EFFORT_BUDGETS[resolved.value];

  return (
    <div className="modelchip" ref={boxRef}>
      <button
        className="cbtn ghost modelchip-btn"
        onClick={() => setOpen((v) => !v)}
        title={`${resolved.value} effort — ${budget.blurb}`}
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
                <span className="effortrow-b">{EFFORT_BUDGETS[e].blurb}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
