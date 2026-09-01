/* ============================================================================
 * CandidateTray — the memory staging tray: accept, edit, reject, one at a
 * time or in bulk. Nothing here is memory until accepted (services/
 * candidates.ts).
 * ========================================================================== */
import { useState } from "react";
import * as store from "@/services/store";
import * as candidates from "@/services/candidates";
import { useToast } from "@/context/ToastContext";
import { useStoreSync } from "@/hooks/useStoreSync";
import SheetShell from "../SheetShell";

export default function CandidateTray() {
  useStoreSync(candidates);
  const toast = useToast();
  const projectId = store.get().activeProjectId;
  const items = candidates.pending(projectId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  function acceptOne(id: string, text?: string) {
    candidates.accept(id, text !== undefined ? { text } : undefined);
    setEditingId(null);
    toast("Added to memory");
  }
  function rejectOne(id: string) {
    candidates.reject(id);
  }
  function acceptAll() {
    const n = candidates.acceptAll(items.map((c) => c.id)).length;
    toast(`${n} added to memory`);
  }
  function rejectAll() {
    candidates.rejectAll(items.map((c) => c.id));
    toast("Cleared");
  }

  return (
    <SheetShell title="Memory tray" sub={`${items.length} pending`}>
      {items.length === 0 ? (
        <div className="empty">Nothing waiting. Distilling a journal entry proposes memory here.</div>
      ) : (
        <>
          <div className="btnrow" style={{ marginBottom: 14 }}>
            <button className="btn pri sm" onClick={acceptAll}>
              Accept all
            </button>
            <button className="btn sm" onClick={rejectAll}>
              Reject all
            </button>
          </div>
          <div className="list">
            {items.map((c) => (
              <div key={c.id} className="prop">
                {editingId === c.id ? (
                  <>
                    <textarea className="fi" value={editText} onChange={(e) => setEditText(e.target.value)} autoFocus />
                    <div className="btnrow" style={{ marginTop: 0 }}>
                      <button className="btn sm pri" onClick={() => acceptOne(c.id, editText)}>
                        Save &amp; accept
                      </button>
                      <button className="btn sm" onClick={() => setEditingId(null)}>
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="tagmini">
                      {c.scope} · {c.type}
                      {c.supersedes ? " · replaces existing" : ""}
                    </span>
                    <div className="qmini">{c.text}</div>
                    <div className="btnrow" style={{ marginTop: 8 }}>
                      <button className="btn sm pri" onClick={() => acceptOne(c.id)}>
                        Accept
                      </button>
                      <button
                        className="btn sm"
                        onClick={() => {
                          setEditingId(c.id);
                          setEditText(c.text);
                        }}
                      >
                        Edit
                      </button>
                      <button className="btn sm danger" onClick={() => rejectOne(c.id)}>
                        Reject
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </SheetShell>
  );
}
