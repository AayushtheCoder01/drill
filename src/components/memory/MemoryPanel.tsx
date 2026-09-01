/* ============================================================================
 * MemoryPanel — browse, filter, edit, pin and retire memory.
 *
 * Nothing here is auto-written except through Distill; "+ Add memory" is the
 * manual path the type system calls `source: "manual"`. Consolidate reuses
 * RollupDiff (see journal/RollupDiff.tsx) — same shape of approval, whether
 * it came from a weekly rollup or a stand-alone tidy-up.
 * ========================================================================== */
import { useState } from "react";
import * as store from "@/services/store";
import * as memoryStore from "@/services/memoryStore";
import * as AI from "@/services/ai";
import { useToast } from "@/context/ToastContext";
import { useStoreSync } from "@/hooks/useStoreSync";
import SheetShell from "../SheetShell";
import SwitchRow from "../ui/SwitchRow";
import RollupDiff from "../journal/RollupDiff";
import type { MemoryDiffLine } from "@/types/journal";
import type { MemoryScope, MemoryType } from "@/types";

const TYPES: MemoryType[] = ["profile", "preference", "goal", "convention", "understanding", "open", "reference"];

export default function MemoryPanel() {
  useStoreSync(memoryStore);
  const toast = useToast();
  const projectId = store.get().activeProjectId;

  const [scopeFilter, setScopeFilter] = useState<"all" | MemoryScope>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | MemoryType>("all");
  const [showInactive, setShowInactive] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newScope, setNewScope] = useState<MemoryScope>("project");
  const [newType, setNewType] = useState<MemoryType>("understanding");
  const [newText, setNewText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [consolBusy, setConsolBusy] = useState(false);
  const [consolDiff, setConsolDiff] = useState<MemoryDiffLine[] | null>(null);

  const shown = memoryStore
    .list({ activeOnly: !showInactive })
    .filter((m) => m.scope === "global" || m.projectId === projectId)
    .filter((m) => scopeFilter === "all" || m.scope === scopeFilter)
    .filter((m) => typeFilter === "all" || m.type === typeFilter);

  function addMemory() {
    if (!newText.trim()) return;
    memoryStore.create({
      scope: newScope,
      projectId: newScope === "global" ? null : projectId,
      type: newType,
      text: newText,
      source: "manual"
    });
    setNewText("");
    setAdding(false);
    toast("Added");
  }

  function saveEdit(id: string) {
    memoryStore.update(id, { text: editText });
    setEditingId(null);
  }

  function consolidate() {
    const mem = memoryStore.list({ scope: "project", projectId, activeOnly: true });
    if (mem.length < 2) {
      toast("Not enough project memory to consolidate yet");
      return;
    }
    setConsolBusy(true);
    AI.consolidateMemory(mem, store.activeProject())
      .then((diff) => {
        if (!diff.length) toast("Already tidy — nothing to change");
        else setConsolDiff(diff);
      })
      .catch((e: Error) => toast(e.message, 5000))
      .finally(() => setConsolBusy(false));
  }

  return (
    <SheetShell title="Memory" sub={`${shown.length} shown`}>
      <div className="seg" style={{ marginBottom: 10 }}>
        <button className={scopeFilter === "all" ? "on" : ""} onClick={() => setScopeFilter("all")}>
          All
        </button>
        <button className={scopeFilter === "global" ? "on" : ""} onClick={() => setScopeFilter("global")}>
          Global
        </button>
        <button className={scopeFilter === "project" ? "on" : ""} onClick={() => setScopeFilter("project")}>
          Project
        </button>
      </div>
      <select className="fi" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as "all" | MemoryType)}>
        <option value="all">Every type</option>
        {TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <SwitchRow title="Show retired" sub="includes memory superseded or retired by consolidation" on={showInactive} onToggle={() => setShowInactive((v) => !v)} />

      <div className="btnrow" style={{ margin: "14px 0" }}>
        <button className="btn sm" onClick={() => setAdding((v) => !v)}>
          {adding ? "Cancel" : "+ Add memory"}
        </button>
        <button className="btn sm" disabled={consolBusy} onClick={consolidate}>
          {consolBusy ? "Checking…" : "Consolidate project memory"}
        </button>
      </div>

      {adding && (
        <div className="prop">
          <div className="seg" style={{ marginBottom: 8 }}>
            <button className={newScope === "project" ? "on" : ""} onClick={() => setNewScope("project")}>
              Project
            </button>
            <button className={newScope === "global" ? "on" : ""} onClick={() => setNewScope("global")}>
              Global
            </button>
          </div>
          <select className="fi" value={newType} onChange={(e) => setNewType(e.target.value as MemoryType)}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <textarea className="fi" placeholder="one fact, one to three sentences" value={newText} onChange={(e) => setNewText(e.target.value)} />
          <button className="btn pri sm" onClick={addMemory}>
            Add
          </button>
        </div>
      )}

      <div className="list">
        {shown.map((m) => (
          <div key={m.id} className={"prop" + (m.active ? "" : " off")}>
            {editingId === m.id ? (
              <>
                <textarea className="fi" value={editText} onChange={(e) => setEditText(e.target.value)} autoFocus />
                <div className="btnrow" style={{ marginTop: 0 }}>
                  <button className="btn sm pri" onClick={() => saveEdit(m.id)}>
                    Save
                  </button>
                  <button className="btn sm" onClick={() => setEditingId(null)}>
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <span className="tagmini">
                  {m.scope} · {m.type}
                  {m.pinned ? " · pinned" : ""}
                  {!m.active ? " · retired" : ""}
                </span>
                <div className="qmini">{m.text}</div>
                <div className="btnrow" style={{ marginTop: 8 }}>
                  <button
                    className="linkbtn"
                    onClick={() => {
                      setEditingId(m.id);
                      setEditText(m.text);
                    }}
                  >
                    edit
                  </button>
                  <button className="linkbtn" onClick={() => memoryStore.setPinned(m.id, !m.pinned)}>
                    {m.pinned ? "unpin" : "pin"}
                  </button>
                  {m.active ? (
                    <button className="linkbtn" onClick={() => memoryStore.retire(m.id)}>
                      retire
                    </button>
                  ) : (
                    <button className="linkbtn" onClick={() => memoryStore.restore(m.id)}>
                      restore
                    </button>
                  )}
                  <span className="s" style={{ marginLeft: "auto" }}>
                    used {m.useCount}×
                  </span>
                </div>
              </>
            )}
          </div>
        ))}
        {!shown.length && <div className="empty">No memory yet — distill a journal entry, or add one by hand.</div>}
      </div>

      {consolDiff && (
        <RollupDiff title="Consolidate memory" sub="review before it changes memory" diff={consolDiff} projectId={projectId} onClose={() => setConsolDiff(null)} />
      )}
    </SheetShell>
  );
}
