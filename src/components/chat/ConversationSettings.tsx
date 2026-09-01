/* ============================================================================
 * ConversationSettings — the chat drawer's entry into the unified settings
 * system. Same three scope components SettingsPanel uses in the review
 * loop; this is the drawer chrome around them. Replaces SettingsDrawer.tsx.
 * ========================================================================== */
import { useState } from "react";
import * as store from "@/services/store";
import { useChat } from "@/context/ChatContext";
import GlobalScope from "../settings/GlobalScope";
import ProjectScope from "../settings/ProjectScope";
import ConversationScope from "../settings/ConversationScope";
import Icon from "../ui/Icon";

type Tab = "conversation" | "project" | "global";

export default function ConversationSettings({ onClose }: { onClose: () => void }) {
  const { conversation } = useChat();
  const [tab, setTab] = useState<Tab>("conversation");
  const projectId = conversation?.projectId || store.get().activeProjectId;

  return (
    <div className="drawer">
      <div className="drawer-head">
        <h3>Settings</h3>
        <button className="chat-headbtn" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <div className="tabs" style={{ margin: "12px 16px 0" }}>
        <button className={"tab" + (tab === "conversation" ? " on" : "")} onClick={() => setTab("conversation")}>
          Conversation
        </button>
        <button className={"tab" + (tab === "project" ? " on" : "")} onClick={() => setTab("project")}>
          Project
        </button>
        <button className={"tab" + (tab === "global" ? " on" : "")} onClick={() => setTab("global")}>
          Global
        </button>
      </div>
      <div className="drawer-body">
        {tab === "conversation" && <ConversationScope />}
        {tab === "project" && <ProjectScope projectId={projectId} />}
        {tab === "global" && <GlobalScope />}
      </div>
    </div>
  );
}
