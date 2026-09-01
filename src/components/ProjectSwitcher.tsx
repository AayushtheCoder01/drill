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

  function pick(id: string) {
    setOpen(false);
    if (id !== activeP.id) switchProject(id);
  }

  function newProject() {
    const name = window.prompt("Name the new project:", "");
    if (!name || !name.trim()) return;
    const p = store.createProject(name.trim());
    setOpen(false);
    switchProject(p.id);
  }

  /* A three-step prompt sequence rather than a form: Phase 2 builds the real
   *  settings panel with proper fields. This just needs to get name, blurb
   *  and goals editable somewhere. Cancelling any step (null, not empty
   *  string) aborts the rest so a stray Escape can't wipe a later field. */
  function edit(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const p = store.projects()[id];
    const name = window.prompt("Project name:", p.name);
    if (name === null) return;
    const blurb = window.prompt("One-line blurb, shown under the name in this switcher:", p.blurb);
    if (blurb === null) return;
    const goals = window.prompt(
      "Goals — one line, e.g. \"Understand ML well enough to implement from scratch.\" Later phases inject this into chat:",
      p.goals
    );
    if (goals === null) return;
    if (name.trim()) store.renameProject(id, name);
    store.updateProject(id, { blurb: blurb.trim(), goals: goals.trim() });
  }

  function toggleArchive(id: string, e: React.MouseEvent) {
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
    if (!window.confirm(`Archive "${p.name}"? Its decks and chats stay put — switch back any time from an archived project.`))
      return;
    store.archiveProject(id, true);
    if (id === activeP.id) switchProject(others[0].id);
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
                  <span className="x" onClick={(e) => edit(p.id, e)} title="Edit name, blurb, goals">
                    <Icon name="pencil" size={12} />
                  </span>
                  <span className="x" onClick={(e) => toggleArchive(p.id, e)} title={p.archived ? "Unarchive" : "Archive"}>
                    <Icon name="archive" size={12} />
                  </span>
                </span>
              </button>
            ))}
          </div>
          <button className="proj-switch-new" onClick={newProject}>
            <Icon name="plus" size={13} /> New project
          </button>
        </div>
      )}
    </div>
  );
}
