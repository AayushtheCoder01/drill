/* ============================================================================
 * CommandPalette — ctrl/cmd+K. Jumps to a conversation or runs an action.
 *
 * Conversations and actions share one list because when you hit the shortcut
 * you know what you want, not which category it lives in.
 * ========================================================================== */
import { useEffect, useMemo, useRef, useState } from "react";
import * as chatStore from "@/services/chatStore";
import { useRoute } from "@/context/RouteContext";

export interface PaletteAction {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

export default function CommandPalette({
  actions,
  onClose
}: {
  actions: PaletteAction[];
  onClose: () => void;
}) {
  const { projectId, openChat } = useRoute();
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const convs: PaletteAction[] = chatStore
      .list()
      .filter((m) => !m.archived && m.projectId === projectId)
      .slice(0, 40)
      .map((m) => ({
        id: "conv:" + m.id,
        label: m.title,
        hint: "chat",
        run: () => openChat(m.id)
      }));
    const all = [...actions, ...convs];
    if (!q) return all.slice(0, 30);
    return all.filter((a) => a.label.toLowerCase().includes(q) || (a.hint || "").toLowerCase().includes(q)).slice(0, 30);
  }, [query, actions]);

  useEffect(() => setSel(0), [query]);

  useEffect(() => {
    const el = listRef.current?.querySelector(".palette-item.sel");
    el?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((i) => (i + 1) % Math.max(items.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((i) => (i - 1 + items.length) % Math.max(items.length, 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const it = items[sel];
      if (it) {
        onClose();
        it.run();
      }
    } else if (e.key === "Escape") {
      onClose();
    }
  }

  return (
    <div
      className="palette-wrap"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="palette">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Jump to a conversation, or type a command…"
          spellCheck={false}
        />
        <div className="palette-list" ref={listRef}>
          {items.length === 0 ? (
            <div className="palette-empty">Nothing matches.</div>
          ) : (
            items.map((it, i) => (
              <button
                key={it.id}
                className={"palette-item" + (i === sel ? " sel" : "")}
                onMouseEnter={() => setSel(i)}
                onClick={() => {
                  onClose();
                  it.run();
                }}
              >
                <span className="pt">{it.label}</span>
                {it.hint && <span className="pk">{it.hint}</span>}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
