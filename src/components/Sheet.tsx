import { Component, type ReactNode } from "react";
import type { PaneState } from "@/context/SheetContext";
import { useSheet } from "@/context/SheetContext";
import MenuPane from "./panes/MenuPane";
import StatsPane from "./panes/StatsPane";
import DecksPane from "./panes/DecksPane";
import LibraryPane from "./panes/LibraryPane";
import EditorPane from "./panes/EditorPane";
import AIPane from "./panes/AIPane";
import FixPane from "./panes/FixPane";
import NotesPane from "./panes/NotesPane";
import ChatPane from "./panes/ChatPane";
import SettingsPanel from "./settings/SettingsPanel";
import IOPane from "./panes/IOPane";
import ExamplesPane from "./panes/ExamplesPane";
import MemoryPanel from "./memory/MemoryPanel";
import CandidateTray from "./memory/CandidateTray";
import RunTranscript from "./RunTranscript";

function renderPane(pane: PaneState) {
  switch (pane.name) {
    case "menu":
      return <MenuPane />;
    case "stats":
      return <StatsPane />;
    case "decks":
      return <DecksPane />;
    case "library":
      return <LibraryPane initialFilter={pane.filter} mode={pane.mode} />;
    case "editor":
      return <EditorPane deckId={pane.deckId} cardId={pane.cardId} />;
    case "ai":
      return <AIPane />;
    case "fix":
      return <FixPane item={pane.item} />;
    case "notes":
      return <NotesPane card={pane.card} />;
    case "chat":
      return <ChatPane card={pane.card} />;
    case "settings":
      return <SettingsPanel />;
    case "io":
      return <IOPane />;
    case "examples":
      return <ExamplesPane />;
    case "memory":
      return <MemoryPanel />;
    case "candidates":
      return <CandidateTray />;
    case "transcript":
      return <RunTranscript />;
    default:
      return null;
  }
}

export default function Sheet({ pane }: { pane: PaneState | null }) {
  const { close } = useSheet();
  return (
    <div
      className="sheet"
      hidden={!pane}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      {pane && (
        <div className="sheet-inner">
          <ErrorGuard>{renderPane(pane)}</ErrorGuard>
        </div>
      )}
    </div>
  );
}

/** A pane throwing (bad state, a missing card after a delete) closes the
 *  sheet instead of taking the whole app down with it. */
class ErrorGuard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}
