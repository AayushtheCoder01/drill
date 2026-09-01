/* ============================================================================
 * GlobalProjectTabs — the Global/Project tab switcher shared by both
 * places settings is reachable outside a conversation: the review loop's
 * Sheet-based SettingsPanel and the chrome-free SettingsModal used by the
 * journal/exam views, which have no SheetProvider to hang a pane off.
 * ========================================================================== */
import { useState } from "react";
import * as store from "@/services/store";
import GlobalScope from "./GlobalScope";
import ProjectScope from "./ProjectScope";

type Tab = "global" | "project";

export default function GlobalProjectTabs({ initialTab = "global" }: { initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const projectId = store.get().activeProjectId;

  return (
    <>
      <div className="tabs">
        <button className={"tab" + (tab === "global" ? " on" : "")} onClick={() => setTab("global")}>
          Global
        </button>
        <button className={"tab" + (tab === "project" ? " on" : "")} onClick={() => setTab("project")}>
          Project
        </button>
      </div>
      {tab === "global" ? <GlobalScope /> : <ProjectScope projectId={projectId} />}
    </>
  );
}
