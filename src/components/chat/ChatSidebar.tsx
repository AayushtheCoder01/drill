/* ============================================================================
 * ChatSidebar — conversation list, grouped by recency, with search.
 *
 * Search runs over full transcripts (chatStore.search reads IndexedDB), not
 * just titles: the thing you remember about a conversation from three weeks
 * ago is usually a phrase inside it.
 * ========================================================================== */
import { useEffect, useMemo, useRef, useState } from "react";
import * as chatStore from "@/services/chatStore";
import { useRoute } from "@/context/RouteContext";
import { DAY } from "@/lib/util";
import Icon from "../ui/Icon";
import type { ConversationMeta } from "@/types/chat";

function groupOf(updated: number): string {
  const age = Date.now() - updated;
  if (age < DAY) return "Today";
  if (age < 2 * DAY) return "Yesterday";
  if (age < 7 * DAY) return "This week";
  if (age < 30 * DAY) return "This month";
  return "Older";
}

export default function ChatSidebar({
  onNew,
  onClose,
  onOpenSearchResult
}: {
  onNew: () => void;
  onClose?: () => void;
  onOpenSearchResult?: () => void;
}) {
  const { projectId, conversationId, openChat } = useRoute();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<chatStore.SearchHit[] | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const metas = chatStore.list().filter((m) => m.projectId === projectId);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const q = query.trim();
    if (q.length < 2) {
      setHits(null);
      return;
    }
    timer.current = setTimeout(() => {
      // search() reads the whole IndexedDB store, not just this project's
      // conversations, so filter its hits down the same way the list is.
      void chatStore.search(q).then((all) => setHits(all.filter((h) => h.meta.projectId === projectId)));
    }, 220);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, projectId]);

  const groups = useMemo(() => {
    const visible = metas.filter((m) => (showArchived ? m.archived : !m.archived));
    const pinned = visible.filter((m) => m.pinned);
    const rest = visible.filter((m) => !m.pinned);
    const out: { label: string; items: ConversationMeta[] }[] = [];
    if (pinned.length) out.push({ label: "Pinned", items: pinned });
    let current = "";
    for (const m of rest) {
      const g = groupOf(m.updated);
      if (g !== current) {
        out.push({ label: g, items: [] });
        current = g;
      }
      out[out.length - 1].items.push(m);
    }
    return out.filter((g) => g.items.length);
  }, [metas, showArchived]);

  function del(e: React.MouseEvent, m: ConversationMeta) {
    e.stopPropagation();
    if (!window.confirm(`Delete "${m.title}"? This cannot be undone.`)) return;
    chatStore.remove(m.id);
    if (conversationId === m.id) openChat(null);
  }

  function row(m: ConversationMeta, subtitle: string) {
    return (
      <button
        key={m.id}
        className={"side-item" + (m.id === conversationId ? " on" : "")}
        onClick={() => {
          openChat(m.id);
          onClose?.();
        }}
      >
        <span className="st">
          {m.pinned && <Icon name="star-filled" size={11} className="side-pin" />}
          <span>{m.title}</span>
        </span>
        <span className="sp">{subtitle}</span>
        <span className="sx" onClick={(e) => del(e, m)} title="Delete conversation" aria-label="Delete conversation">
          <Icon name="close" size={11} />
        </span>
      </button>
    );
  }

  return (
    <>
      <div className="side-head">
        <button className="side-new" onClick={onNew} title="New conversation (ctrl+J)">
          <Icon name="plus" size={14} />
          <span>New chat</span>
          <span className="side-kbd">⌘J</span>
        </button>
      </div>

      <div className="side-search">
        <div className="side-search-box">
          <Icon name="search" size={13} className="side-search-icon" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations…"
            spellCheck={false}
          />
          {query && (
            <button className="side-search-clear" onClick={() => setQuery("")} aria-label="Clear search">
              <Icon name="close" size={11} />
            </button>
          )}
        </div>
      </div>

      <div className="side-list">
        {hits ? (
          hits.length ? (
            <>
              <div className="side-group">
                {hits.length} result{hits.length === 1 ? "" : "s"}
              </div>
              {hits.map((h) => (
                <button
                  key={h.meta.id}
                  className={"side-item" + (h.meta.id === conversationId ? " on" : "")}
                  onClick={() => {
                    openChat(h.meta.id);
                    onOpenSearchResult?.();
                    onClose?.();
                  }}
                >
                  <span className="st">{h.meta.title}</span>
                  <span className="sp">{h.snippet}</span>
                </button>
              ))}
            </>
          ) : (
            <div className="side-group">No matches</div>
          )
        ) : groups.length ? (
          groups.map((g) => (
            <div key={g.label}>
              <div className="side-group">{g.label}</div>
              {g.items.map((m) =>
                row(m, `${m.turnCount} message${m.turnCount === 1 ? "" : "s"}${m.preview ? " · " + m.preview : ""}`)
              )}
            </div>
          ))
        ) : (
          <div className="side-group">{showArchived ? "Nothing archived" : "No conversations yet"}</div>
        )}
      </div>

      <div className="side-foot">
        <button className="side-foot-btn" onClick={() => setShowArchived((v) => !v)}>
          <Icon name="archive" size={12} />
          <span>{showArchived ? "Active chats" : "Archived chats"}</span>
        </button>
      </div>
    </>
  );
}
