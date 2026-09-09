/* ============================================================================
 * MemoryStore — browse, filter, edit, pin and retire everything remembered.
 *
 * Nothing here is auto-written except through Distill; "+ Add" is the manual
 * path the type system calls `source: "manual"`. Consolidate reuses RollupDiff
 * (see journal/RollupDiff.tsx) — same shape of approval, whether it came from
 * a weekly rollup or a stand-alone tidy-up.
 *
 * Was a sheet pane in the review loop, which meant the answer to "what does it
 * know about me" was only available from the one screen that never asks.
 * ========================================================================== */
import { useState } from "react";
import * as store from "@/services/store";
import * as memoryStore from "@/services/memoryStore";
import * as AI from "@/services/ai";
import { useToast } from "@/context/ToastContext";
import { useStoreSync } from "@/hooks/useStoreSync";
import SwitchRow from "../../../ui/SwitchRow";
import RollupDiff from "../../../journal/RollupDiff";
import Section from "../../Section";
import type { MemoryDiffLine } from "@/types/journal";
import type { MemoryScope, MemoryType } from "@/types";

const TYPES: MemoryType[] = ["profile", "preference", "goal", "convention", "understanding", "open", "reference"];

export default function MemoryStore() {
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
    <Section id="memory.store" title={`What it knows (${shown.length})`}>
      <div className="seg">
        <button className={scopeFilter === "all" ? "on" : ""} onClick={() => setScopeFilter("all")}>
          All
        </button>
        <button className={scopeFilter === "global" ? "on" : ""} onClick={() => setScopeFilter("global")}>
          About you
        </button>
        <button className={scopeFilter === "project" ? "on" : ""} onClick={() => setScopeFilter("project")}>
          This project
        </button>
      </div>
      <select className="fi" aria-label="Filter by type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as "all" | MemoryType)}>
        <option value="all">Every type</option>
        {TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <SwitchRow
        title="Show retired"
        sub="Includes memory superseded or retired by consolidation."
        on={showInactive}
        onToggle={() => setShowInactive((v) => !v)}
      />

      <div className="btnrow">
        <button className="btn sm" onClick={() => setAdding((v) => !v)}>
          {adding ? "Cancel" : "+ Add a memory"}
        </button>
        <button className="btn sm" disabled={consolBusy} onClick={consolidate}>
          {consolBusy ? "Checking…" : "Consolidate project memory"}
        </button>
      </div>

      {adding && (
        <div className="prop">
          <div className="seg">
            <button className={newScope === "project" ? "on" : ""} onClick={() => setNewScope("project")}>
              This project
            </button>
            <button className={newScope === "global" ? "on" : ""} onClick={() => setNewScope("global")}>
              About you
            </button>
          </div>
          <select className="fi" aria-label="Type" value={newType} onChange={(e) => setNewType(e.target.value as MemoryType)}>
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
                <div className="btnrow">
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
                  {m.scope === "global" ? "about you" : "this project"} · {m.type}
                  {m.pinned ? " · pinned" : ""}
                  {!m.active ? " · retired" : ""}
                </span>
                <div className="qmini">{m.text}</div>
                <div className="btnrow">
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
                  <span className="s mem-uses">used {m.useCount}×</span>
                </div>
              </>
            )}
          </div>
        ))}
        {!shown.length && <div className="empty">No memory yet — distill a journal entry, or add one by hand.</div>}
      </div>

      {consolDiff && (
        <RollupDiff
          title="Consolidate memory"
          sub="review before it changes memory"
          diff={consolDiff}
          projectId={projectId}
          onClose={() => setConsolDiff(null)}
        />
      )}
    </Section>
  );
}
