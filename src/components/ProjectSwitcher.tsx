/* ============================================================================
 * ProjectSwitcher — pick, create, rename and archive projects.
 *
 * A self-contained popover rather than a Sheet pane: the review loop and chat
 * are separate provider trees (App.tsx only wraps the drill view in
 * SheetProvider), and this is the one piece of chrome both need. Keeping its
 * own open/closed state means it drops into Header.tsx and ChatSidebar.tsx
 * without either view's provider tree knowing about the other.
 * ========================================================================== */
import { useEffect, useRef, useState } from "react";
import * as store from "@/services/store";
import { useDrillStore } from "@/hooks/useDrillStore";
import { useRoute } from "@/context/RouteContext";
import Icon from "./ui/Icon";

export default function ProjectSwitcher({ variant = "bar" }: { variant?: "bar" | "inline" }) {
  useDrillStore();
  const { switchProject } = useRoute();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
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

  const activeP = store.activeProject();
  const projects = Object.values(store.projects())
    .filter((p) => !p.archived || p.id === activeP.id)
    .sort((a, b) => a.created - b.created);

  const [dialog, setDialog] = useState<
    | null
    | { type: "new" }
    | { type: "edit"; id: string; name: string; blurb: string; goals: string }
    | { type: "archive"; id: string; name: string }
  >(null);

  function pick(id: string) {
    setOpen(false);
    if (id !== activeP.id) switchProject(id);
  }

  function startNewProject() {
    setOpen(false);
    setDialog({ type: "new" });
  }

  function submitNewProject(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const p = store.createProject(trimmed);
    setDialog(null);
    switchProject(p.id);
  }

  function startEdit(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const p = store.projects()[id];
    setOpen(false);
    setDialog({
      type: "edit",
      id,
      name: p.name,
      blurb: p.blurb || "",
      goals: p.goals || ""
    });
  }

  function submitEdit(id: string, name: string, blurb: string, goals: string) {
    const trimmedName = name.trim();
    if (trimmedName) store.renameProject(id, trimmedName);
    store.updateProject(id, { blurb: blurb.trim(), goals: goals.trim() });
    setDialog(null);
  }

  function startToggleArchive(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const p = store.projects()[id];
    if (p.archived) {
      store.archiveProject(id, false);
      return;
    }
    const others = projects.filter((x) => x.id !== id && !x.archived);
    if (!others.length) {
      window.alert("Can't archive the only project.");
      return;
    }
    setOpen(false);
    setDialog({ type: "archive", id, name: p.name });
  }

  function confirmArchive(id: string) {
    const others = projects.filter((x) => x.id !== id && !x.archived);
    store.archiveProject(id, true);
    setDialog(null);
    if (id === activeP.id && others.length) switchProject(others[0].id);
  }

  return (
    <div className={"proj-switch " + variant + (open ? " open" : "")} ref={ref}>
      <button className="proj-switch-btn" onClick={() => setOpen((v) => !v)} title={"Project: " + activeP.name}>
        {/* The monogram is what is left of the project in the collapsed rail,
            so it is always rendered rather than swapped in — there is nothing
            to pop when the labels fade out beside it. */}
        <span className="proj-switch-mono" aria-hidden="true">
          {activeP.name.trim().charAt(0) || "?"}
        </span>
        <span className="proj-switch-name">{activeP.name}</span>
        <Icon name="chevron" size={11} className="chev" />
      </button>
      {open && (
        <div className="proj-switch-menu">
          <div className="proj-switch-list">
            {projects.map((p) => (
              <button key={p.id} className={"proj-switch-item" + (p.id === activeP.id ? " on" : "")} onClick={() => pick(p.id)}>
                <span className="grow">
                  <span className="t">
                    {p.name}
                    {p.archived ? " · archived" : ""}
                  </span>
                  {p.blurb && <span className="s">{p.blurb}</span>}
                </span>
                <span className="proj-switch-acts">
                  <span className="x" onClick={(e) => startEdit(p.id, e)} title="Edit name, blurb, goals">
                    <Icon name="pencil" size={12} />
                  </span>
                  <span className="x" onClick={(e) => startToggleArchive(p.id, e)} title={p.archived ? "Unarchive" : "Archive"}>
                    <Icon name="archive" size={12} />
                  </span>
                </span>
              </button>
            ))}
          </div>
          <button className="proj-switch-new" onClick={startNewProject}>
            <Icon name="plus" size={13} /> New project
          </button>
        </div>
      )}

      {dialog?.type === "new" && (
        <NewProjectModal onCancel={() => setDialog(null)} onCreate={submitNewProject} />
      )}

      {dialog?.type === "edit" && (
        <EditProjectModal
          initial={dialog}
          onCancel={() => setDialog(null)}
          onSave={(name, blurb, goals) => submitEdit(dialog.id, name, blurb, goals)}
        />
      )}

      {dialog?.type === "archive" && (
        <ArchiveProjectModal
          name={dialog.name}
          onCancel={() => setDialog(null)}
          onConfirm={() => confirmArchive(dialog.id)}
        />
      )}
    </div>
  );
}

function NewProjectModal({ onCancel, onCreate }: { onCancel: () => void; onCreate: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <div className="sheet" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="panel-inner" style={{ maxWidth: "26rem" }}>
        <div className="sheet-head" style={{ padding: "var(--s-3) 0 var(--s-2)" }}>
          <h3>New Project</h3>
          <button className="iconbtn" onClick={onCancel} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onCreate(name);
          }}
          style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)", marginTop: "var(--s-3)" }}
        >
          <div className="fi">
            <label className="f">Project Name</label>
            <input
              type="text"
              autoFocus
              required
              placeholder="e.g. Distributed Systems, Japanese, ML Foundations"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="btnrow" style={{ justifyContent: "flex-end", marginTop: "var(--s-2)" }}>
            <button type="button" className="btn sm" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn pri sm" disabled={!name.trim()}>
              Create Project
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditProjectModal({
  initial,
  onCancel,
  onSave
}: {
  initial: { id: string; name: string; blurb: string; goals: string };
  onCancel: () => void;
  onSave: (name: string, blurb: string, goals: string) => void;
}) {
  const [name, setName] = useState(initial.name);
  const [blurb, setBlurb] = useState(initial.blurb);
  const [goals, setGoals] = useState(initial.goals);

  return (
    <div className="sheet" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="panel-inner" style={{ maxWidth: "30rem" }}>
        <div className="sheet-head" style={{ padding: "var(--s-3) 0 var(--s-2)" }}>
          <h3>Edit Project</h3>
          <button className="iconbtn" onClick={onCancel} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave(name, blurb, goals);
          }}
          style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)", marginTop: "var(--s-3)" }}
        >
          <div className="fi">
            <label className="f">Project Name</label>
            <input
              type="text"
              autoFocus
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="fi">
            <label className="f">One-line Blurb</label>
            <input
              type="text"
              placeholder="Shown under the name in the project switcher"
              value={blurb}
              onChange={(e) => setBlurb(e.target.value)}
            />
          </div>
          <div className="fi">
            <label className="f">Learning Goals</label>
            <textarea
              placeholder="e.g. Understand ML deeply enough to implement transformers from scratch."
              rows={3}
              value={goals}
              onChange={(e) => setGoals(e.target.value)}
            />
          </div>
          <div className="btnrow" style={{ justifyContent: "flex-end", marginTop: "var(--s-2)" }}>
            <button type="button" className="btn sm" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn pri sm" disabled={!name.trim()}>
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ArchiveProjectModal({
  name,
  onCancel,
  onConfirm
}: {
  name: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="sheet" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="panel-inner" style={{ maxWidth: "26rem" }}>
        <div className="sheet-head" style={{ padding: "var(--s-3) 0 var(--s-2)" }}>
          <h3>Archive Project</h3>
          <button className="iconbtn" onClick={onCancel} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div style={{ marginTop: "var(--s-3)", color: "var(--ink-2)", fontSize: "var(--t-sm)", lineHeight: "var(--lh-snug)" }}>
          <p>
            Archive <strong>{name}</strong>?
          </p>
          <p style={{ marginTop: "var(--s-2)", color: "var(--ink-3)", fontSize: "var(--t-xs)" }}>
            Its decks, journals, and chats stay safe. You can unarchive or switch back any time.
          </p>
        </div>
        <div className="btnrow" style={{ justifyContent: "flex-end", marginTop: "var(--s-5)" }}>
          <button type="button" className="btn sm" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn danger sm" onClick={onConfirm}>
            Archive Project
          </button>
        </div>
      </div>
    </div>
  );
}
