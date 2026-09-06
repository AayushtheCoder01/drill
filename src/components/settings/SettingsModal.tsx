/* ============================================================================
 * SettingsModal — settings reachable from the journal and exam views, which
 * have no SheetProvider to hang a pane off. Same SettingsHome content as
 * SettingsPanel, in a stand-alone .sheet like CardsModal/DistillReview.
 * ========================================================================== */
import SettingsHome from "./SettingsHome";
import Icon from "../ui/Icon";

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="sheet"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet-inner">
        <div className="sheet-head">
          <h3>Settings</h3>
          <span className="sub">everything, by category</span>
          <button className="iconbtn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="sheet-body">
          <SettingsHome />
        </div>
      </div>
    </div>
  );
}
