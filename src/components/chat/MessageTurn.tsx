/* ============================================================================
 * MessageTurn — one exchange, plus everything you can do with it.
 *
 * The action row is where this stops being a generic chat client: any reply
 * can become flashcards, an insight-log entry, or the root of a new
 * conversation without leaving the thread.
 * ========================================================================== */
import { useEffect, useMemo, useRef, useState } from "react";
import { renderMarkdown, markdownToText } from "@/lib/markdown";
import MemorySaved from "./MemorySaved";
import Sources from "./Sources";
import { formatCost, formatTokens } from "@/lib/tokens";
import * as chatStore from "@/services/chatStore";
import { useToast } from "@/context/ToastContext";
import type { Turn } from "@/types/chat";
import Icon from "../ui/Icon";

interface Props {
  turn: Turn;
  isLast: boolean;
  streamingText: string | null;
  busy: boolean;
  onRegenerate: () => void;
  onEdit: (text: string) => void;
  onBranch: () => void;
  onMakeCards: (text: string) => void;
  onSaveNote: (text: string) => void;
  onVariant: (i: number) => void;
  onStar: () => void;
  onDelete: () => void;
  onRetry: () => void;
}

export default function MessageTurn({
  turn,
  isLast,
  streamingText,
  busy,
  onRegenerate,
  onEdit,
  onBranch,
  onMakeCards,
  onSaveNote,
  onVariant,
  onStar,
  onDelete,
  onRetry
}: Props) {
  const toast = useToast();
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const isUser = turn.role === "user";
  const streaming = streamingText != null;
  const content = streaming ? streamingText : chatStore.activeContent(turn);
  const variant = turn.variants[turn.active];

  const html = useMemo(() => (isUser ? "" : renderMarkdown(content)), [content, isUser]);

  /* Code-block copy buttons are rendered as raw HTML by the markdown pipeline,
     so their clicks are picked up here by delegation rather than by React. */
  useEffect(() => {
    const el = bodyRef.current;
    if (!el || isUser) return;
    const onClick = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest("[data-copy]");
      if (!btn) return;
      const block = btn.closest(".codeblock") as HTMLElement | null;
      const code = block?.dataset.code;
      if (code == null) return;
      void navigator.clipboard.writeText(code).then(
        () => {
          btn.textContent = "Copied";
          setTimeout(() => (btn.textContent = "Copy"), 1400);
        },
        () => toast("Clipboard refused — copy manually")
      );
    };
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, [html, isUser, toast]);

  function beginEdit() {
    setDraft(chatStore.activeContent(turn));
    setEditing(true);
  }

  function commitEdit() {
    const text = draft.trim();
    setEditing(false);
    if (!text || text === chatStore.activeContent(turn)) return;
    onEdit(text);
  }

  function copyAll() {
    void navigator.clipboard.writeText(content).then(
      () => toast("Copied"),
      () => toast("Clipboard refused")
    );
  }

  /** Prefer whatever the user has highlighted inside this message — turning
   *  one paragraph into cards is far more common than turning a whole essay
   *  into cards. */
  function selectedOrAll(): string {
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (text && text.length > 20 && bodyRef.current && sel && sel.anchorNode && bodyRef.current.contains(sel.anchorNode)) {
      return text;
    }
    return markdownToText(content);
  }

  /* An assistant turn with no variants yet and nothing streaming is a request
     that failed before producing anything. */
  const failed = !isUser && !streaming && turn.variants.length === 0;

  return (
    <div className={`turn ${isUser ? "user" : "assistant"}${turn.starred ? " starred" : ""}`}>
      <div className="turn-head">
        <span>{isUser ? "You" : "Assistant"}</span>
        {turn.starred && <Icon name="star-filled" size={11} style={{ color: "var(--amber)" }} />}
        {turn.variants.length > 1 && (
          <span className="variant-nav">
            <button onClick={() => onVariant(turn.active - 1)} disabled={turn.active === 0} aria-label="Previous version">
              ‹
            </button>
            {turn.active + 1}/{turn.variants.length}
            <button
              onClick={() => onVariant(turn.active + 1)}
              disabled={turn.active >= turn.variants.length - 1}
              aria-label="Next version"
            >
              ›
            </button>
          </span>
        )}
      </div>

      {!!turn.attachments?.length && (
        <div className="att-row">
          {turn.attachments.map((a) => (
            <span key={a.id} className="att-chip" title={`${a.text.length.toLocaleString()} characters`}>
              📎 {a.name}
            </span>
          ))}
        </div>
      )}

      {editing ? (
        <div className="composer-box" style={{ marginBottom: 8 }}>
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                commitEdit();
              }
              if (e.key === "Escape") setEditing(false);
            }}
            style={{ minHeight: 90 }}
          />
          <div className="composer-bar">
            <span className="composer-hint" style={{ margin: 0 }}>
              replaces everything after this message
            </span>
            <button className="cbtn ghost" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button className="csend" onClick={commitEdit}>
              Send
            </button>
          </div>
        </div>
      ) : failed ? (
        <div className="chat-err">
          <span style={{ flex: 1 }}>{turn.error || "That request failed."}</span>
          <button onClick={onRetry}>Retry</button>
        </div>
      ) : isUser ? (
        <div className="turn-body">{content}</div>
      ) : (
        <div className="turn-body" ref={bodyRef}>
          <span dangerouslySetInnerHTML={{ __html: html }} />
          {streaming && <span className="caret" />}
          {!streaming && variant?.citations?.length ? <Sources citations={variant.citations} /> : null}
          {!streaming && variant?.saved && <MemorySaved saved={variant.saved} />}
        </div>
      )}

      {!editing && !streaming && !failed && (
        <div className={`turn-acts${isLast ? " always" : ""}`}>
          <button className="tact" onClick={copyAll}>
            Copy
          </button>
          {isUser ? (
            <button className="tact" onClick={beginEdit} disabled={busy}>
              Edit
            </button>
          ) : (
            <>
              <button className="tact" onClick={onRegenerate} disabled={busy}>
                Regenerate
              </button>
              <button className="tact" onClick={() => onMakeCards(selectedOrAll())} disabled={busy}>
                <Icon name="sparkle" size={12} /> Make cards
              </button>
              <button className="tact" onClick={() => onSaveNote(selectedOrAll())}>
                Save insight
              </button>
            </>
          )}
          <button className="tact" onClick={onBranch} title="Copy the thread up to here into a new conversation">
            Branch
          </button>
          <button className={"tact" + (turn.starred ? " on" : "")} onClick={onStar}>
            <Icon name={turn.starred ? "star-filled" : "star"} size={12} />
          </button>
          <button className="tact danger" onClick={onDelete}>
            Delete
          </button>
        </div>
      )}

      {!isUser && !streaming && variant && (variant.usage || variant.elapsed) && (
        <div className="turn-foot">
          {variant.model ? variant.model + " · " : ""}
          {variant.elapsed ? (variant.elapsed / 1000).toFixed(1) + "s" : ""}
          {variant.usage
            ? ` · ${formatTokens(variant.usage.promptTokens)} in / ${formatTokens(variant.usage.completionTokens)} out`
            : ""}
          {variant.usage?.cost != null ? " · " + formatCost(variant.usage.cost) : ""}
        </div>
      )}
    </div>
  );
}
