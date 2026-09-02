/* ============================================================================
 * ModelChip — which model this thread is talking to, in the composer bar.
 *
 * The model was only ever settable in two places, both of them panels you had
 * to go and find: global Settings, and the conversation settings drawer. But
 * choosing a model is a mid-conversation decision — you ask something cheap,
 * then something hard, and you want the bigger model for the hard one without
 * leaving the sentence you are writing.
 *
 * The three-level inheritance is the point, so the chip shows which level is
 * actually in force: a thread with no model of its own says "default" and
 * follows global Settings, and picking one here pins it to this thread only.
 * ========================================================================== */
import { useEffect, useRef, useState } from "react";
import * as AI from "@/services/ai";
import * as chatStore from "@/services/chatStore";
import { useToast } from "@/context/ToastContext";
import type { Conversation } from "@/types/chat";
import Icon from "../ui/Icon";

/** "anthropic/claude-sonnet-4" reads as "claude-sonnet-4" in a chip: the
 *  vendor prefix is the same on every row and eats the width. */
function shortName(id: string): string {
  const tail = id.split("/").pop() || id;
  return tail.length > 28 ? tail.slice(0, 27) + "…" : tail;
}

export default function ModelChip({
  conversation,
  draftModel,
  onDraftModel
}: {
  /** Null on the empty screen, where no conversation exists yet. */
  conversation: Conversation | null;
  draftModel: string;
  onDraftModel: (m: string) => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const boxRef = useRef<HTMLDivElement | null>(null);

  const chosen = conversation ? conversation.model : draftModel;
  const backend = conversation ? conversation.backend : "";
  const resolved = AI.resolve({ backend, model: chosen });
  const pinned = !!chosen;

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

  /* The list is fetched the first time the popover opens rather than on
     mount: most messages are sent without ever touching this, and a model
     list is a network call against the user's own key. */
  useEffect(() => {
    if (!open || models.length || loading) return;
    setLoading(true);
    AI.listModels(backend ? { backend } : undefined)
      .then(setModels)
      .catch((e: Error) => toast(e.message, 5000))
      .finally(() => setLoading(false));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function choose(model: string) {
    if (conversation) {
      conversation.model = model;
      chatStore.persist(conversation, true);
    } else {
      onDraftModel(model);
    }
    setOpen(false);
    setQuery("");
  }

  const q = query.trim().toLowerCase();
  const shown = (q ? models.filter((m) => m.toLowerCase().includes(q)) : models).slice(0, 40);

  return (
    <div className="modelchip" ref={boxRef}>
      <button
        className="cbtn ghost modelchip-btn"
        onClick={() => setOpen((v) => !v)}
        title={
          pinned
            ? `${conversation ? "This conversation is" : "The next conversation will be"} pinned to ${resolved.model}`
            : `Following the default from Settings: ${resolved.model}`
        }
      >
        <span className={"modelchip-dot" + (pinned ? " pinned" : "")} />
        <span className="modelchip-name">{shortName(resolved.model || "no model")}</span>
        <Icon name="chevron" size={11} />
      </button>

      {open && (
        <div className="modelpop">
          <div className="modelpop-head">
            <span>{conversation ? "Model for this conversation" : "Model for the next conversation"}</span>
            {pinned && (
              <button className="modelpop-clear" onClick={() => choose("")}>
                use the default
              </button>
            )}
          </div>

          <input
            className="fi mono"
            autoFocus
            placeholder={loading ? "loading the list…" : "search, or type any model id"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              // Typing an id the list has never heard of is legitimate — a
              // local server's model names are not discoverable everywhere.
              if (e.key === "Enter" && query.trim()) choose(query.trim());
            }}
          />

          <div className="modelpop-list">
            {loading && <div className="modelpop-empty">fetching what your key can reach…</div>}
            {!loading && shown.length === 0 && (
              <div className="modelpop-empty">
                {models.length ? "Nothing matches." : "No list available — type an id and press enter."}
              </div>
            )}
            {shown.map((m) => (
              <button
                key={m}
                className={"modelpop-row" + (m === resolved.model ? " on" : "")}
                onClick={() => choose(m)}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
