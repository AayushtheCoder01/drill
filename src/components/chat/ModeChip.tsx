/* ============================================================================
 * ModeChip — one call, look it up, or work to a plan.
 *
 * Three modes is one more than a toggle can carry, so this is a small popover
 * rather than a switch. It stays a *chip* — same size and weight as its
 * neighbours in the composer — because the mode is a property of the message
 * you are about to send, and belongs beside the model and the effort rather
 * than in a settings drawer two clicks away.
 *
 * Each row states what it costs, in requests, because that is the actual
 * decision. "Deep" with no number beside it is marketing; "up to 8 lookups,
 * each one a request" is a choice.
 * ========================================================================== */
import { useEffect, useRef, useState } from "react";
import * as store from "@/services/store";
import { budgetFor, deepSteps } from "@/lib/effort";
import { resolveEffort } from "@/lib/resolveSetting";
import Icon, { type IconName } from "@/components/ui/Icon";
import type { ChatMode, Conversation } from "@/types/chat";

interface ModeDef {
  id: ChatMode;
  label: string;
  icon: IconName;
  blurb: string;
  /** How many rounds of tool use, given the resolved effort. */
  steps: (agentSteps: number) => number;
}

const MODES: ModeDef[] = [
  {
    id: "direct",
    label: "Direct",
    icon: "bubble",
    blurb: "One request. Context picked before the call. Right for most questions.",
    steps: () => 0
  },
  {
    id: "agent",
    label: "Agent",
    icon: "search",
    blurb: "Looks things up in your record as it goes, then answers.",
    steps: (n) => n
  },
  {
    id: "deep",
    label: "Deep",
    icon: "sparkle",
    blurb: "States a plan, works every step, then answers. For the questions worth waiting for.",
    steps: (n) => deepSteps(n)
  }
];

export default function ModeChip({
  conversation,
  draftMode,
  onDraftMode,
  onChange
}: {
  /** Null on the empty screen, before a thread exists. The chip still shows,
   *  because the mode is part of what the first message will create. */
  conversation: Conversation | null;
  /** Where the choice goes when there is no conversation yet. Without this the
   *  picker silently did nothing on first arrival at chat: ChatContext's
   *  `update()` returns early with no conversation, so the mode was dropped
   *  and the chip snapped back to Direct. Model and effort already worked this
   *  way; mode was added without it. */
  draftMode: ChatMode;
  onDraftMode: (m: ChatMode) => void;
  onChange: (mode: ChatMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement | null>(null);

  const raw = conversation ? conversation.mode : draftMode;
  const mode: ChatMode = raw === "agent" || raw === "deep" ? raw : "direct";
  const current = MODES.find((m) => m.id === mode) || MODES[0];

  /* Resolved through the project exactly as the send path resolves it, so the
     number on the chip is the number the loop will actually get. A chip that
     read the global default while the send path read the project's would be a
     dial that lies. */
  const project = conversation ? store.get().projects[conversation.projectId] : store.activeProject();
  const agentSteps = budgetFor(resolveEffort(conversation ?? undefined, project).value).agentSteps;
  const steps = current.steps(agentSteps);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      /* Escape closes the popover and nothing else. Without stopPropagation
         the same keypress reaches ChatView's handler and closes the whole
         settings drawer behind it. */
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div className="modechip" ref={wrap}>
      <button
        className={"cbtn actchip" + (mode !== "direct" ? " on" : "")}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={current.blurb + (steps ? ` Up to ${steps} lookups, each one a request.` : "")}
      >
        <Icon name={current.icon} size={12} />
        <span>{current.label}{steps ? ` · ${steps}` : ""}</span>
      </button>

      {open && (
        <div className="modechip-pop" role="menu">
          <div className="modechip-head">
            How to answer {conversation ? "in this conversation" : "in the next conversation"}
          </div>
          {MODES.map((m) => {
            const n = m.steps(agentSteps);
            return (
              <button
                key={m.id}
                className={"modechip-row" + (m.id === mode ? " on" : "")}
                role="menuitemradio"
                aria-checked={m.id === mode}
                onClick={() => {
                  if (conversation) onChange(m.id);
                  else onDraftMode(m.id);
                  setOpen(false);
                }}
              >
                <Icon name={m.icon} size={14} className="modechip-icon" />
                <span className="modechip-text">
                  <span className="modechip-name">
                    {m.label}
                    <span className="modechip-cost">{n ? `up to ${n} lookups` : "1 request"}</span>
                  </span>
                  <span className="modechip-blurb">{m.blurb}</span>
                </span>
                {m.id === mode && <Icon name="check" size={13} className="modechip-tick" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
