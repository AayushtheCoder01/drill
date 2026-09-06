/* ============================================================================
 * ConversationSettings — the chat drawer's entry into the unified settings
 * system.
 *
 * It used to carry its own Conversation / Project / Global tab strip, which
 * meant the same settings had two different navigations depending on which
 * half of the app you opened them from. There is one now: this thread's own
 * scope is simply the first category in it, which is also the truthful
 * arrangement — conversation, project and global are one inheritance chain,
 * not three separate panels.
 * ========================================================================== */
import SettingsHome from "../settings/SettingsHome";
import Icon from "../ui/Icon";

export default function ConversationSettings({ onClose }: { onClose: () => void }) {
  return (
    <div className="drawer">
      <div className="drawer-head">
        <h3>Settings</h3>
        <button className="chat-headbtn" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <div className="drawer-body">
        <SettingsHome withConversation initial="conversation" />
      </div>
    </div>
  );
}
