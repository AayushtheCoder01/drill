/* ============================================================================
 * ProjectSwitcher — pick a space: Personal, or one of your projects.
 *
 * Two groups, not one list. A project is a body of work with goals, decks and
 * a journal; Personal is where a question goes when it is just a question, and
 * putting it in the same list as "Distributed Systems" would make it look like
 * a project you had forgotten to name. It gets its own row above the rule, no
 * edit or archive actions — there is always exactly one and it cannot be put
 * away — and switching into it lands on chat rather than the review loop,
 * because there is nothing there to review.
 *
 * A self-contained popover rather than a Sheet pane: the review loop and chat
 * are separate provider trees (App.tsx only wraps the drill view in
 * SheetProvider), and this is the one piece of chrome both need. Keeping its
 * own open/closed state means it drops into Header.tsx and ChatSidebar.tsx
 * without either view's provider tree knowing about the other.
 * ========================================================================== */
import { useEffect, useRef, useState } from "react";
import * as store from "@/services/store";
import * as projects from "@/services/projects";
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
  const personal = projects.personal();
  const onPersonal = projects.isPersonalProject(activeP.id);
  /* list() already leaves the personal space out — it is a space, not a body
     of work, and it is rendered above as its own row. */
  const list = projects.list();

  const [dialog, setDialog] = useState<
    | null
    | { type: "new" }
    | { type: "edit"; id: string; name: string; blurb: string; goals: string }
    | { type: "archive"; id: string; name: string }
  >(null);

  /* Escape closes the dialog, the way it closes every other modal in the app.
     The menu's own Escape handler above only runs while the menu is open, and
     opening a dialog closes it — so without this the dialogs were the one
     surface the key did nothing on. Stops at the dialog rather than falling
     through to Shell, which would close the navigation drawer underneath. */
  useEffect(() => {
    if (!dialog) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setDialog(null);
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [dialog]);

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
    const others = list.filter((x) => x.id !== id && !x.archived);
    if (!others.length) {
      window.alert("Can't archive the only project.");
      return;
    }
    setOpen(false);
    setDialog({ type: "archive", id, name: p.name });
  }

  function confirmArchive(id: string) {
    const others = list.filter((x) => x.id !== id && !x.archived);
    store.archiveProject(id, true);
    setDialog(null);
    if (id === activeP.id && others.length) switchProject(others[0].id);
  }

  return (
    <div className={"proj-switch " + variant + (open ? " open" : "")} ref={ref}>
      <button
        className="proj-switch-btn"
        onClick={() => setOpen((v) => !v)}
        title={onPersonal ? "Personal — chats outside any project" : "Project: " + activeP.name}
      >
        {/* The monogram is what is left of the project in the collapsed rail,
            so it is always rendered rather than swapped in — there is nothing
            to pop when the labels fade out beside it. Personal gets a glyph
            instead of a letter: it is the one space that is always the same
            one, so it is worth being recognisable rather than spelled. */}
        <span className={"proj-switch-mono" + (onPersonal ? " personal" : "")} aria-hidden="true">
          {onPersonal ? <Icon name="bubble" size={13} /> : activeP.name.trim().charAt(0) || "?"}
        </span>
        <span className="proj-switch-name">{activeP.name}</span>
        <Icon name="chevron" size={11} className="chev" />
      </button>
      {open && (
        <div className="proj-switch-menu">
          <div className="proj-switch-list">
            <button
              className={"proj-switch-item personal" + (onPersonal ? " on" : "")}
              onClick={() => pick(personal.id)}
            >
              <Icon name="bubble" size={14} className="proj-switch-icon" />
              <span className="grow">
                <span className="t">{personal.name}</span>
                <span className="s">{personal.blurb}</span>
              </span>
            </button>

            <div className="proj-switch-group">Projects</div>
            {list.map((p) => (
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
            {!list.length && <div className="proj-switch-empty">No projects yet — everything is personal.</div>}
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
      <div className="panel-inner proj-dialog">
        <div className="sheet-head">
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
          className="proj-form"
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
          <div className="btnrow end">
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
      <div className="panel-inner proj-dialog wide">
        <div className="sheet-head">
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
          className="proj-form"
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
          <div className="btnrow end">
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
      <div className="panel-inner proj-dialog">
        <div className="sheet-head">
          <h3>Archive Project</h3>
          <button className="iconbtn" onClick={onCancel} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="proj-confirm">
          <p>
            Archive <strong>{name}</strong>?
          </p>
          <p className="s">
            Its decks, journals, and chats stay safe. You can unarchive or switch back any time.
          </p>
        </div>
        <div className="btnrow end">
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
