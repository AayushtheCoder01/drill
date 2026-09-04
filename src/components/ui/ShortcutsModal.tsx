/* ============================================================================
 * ShortcutsModal — the cheatsheet for every key binding in Drill.
 *
 * Opened with '?' or from the sidebar. Organized by section: Global, Review,
 * Chat and Editing, so muscle memory is easy to learn.
 * ========================================================================== */
import Icon from "./Icon";

interface ShortcutGroup {
  title: string;
  items: { keys: string[]; desc: string }[];
}

const SHORTCUTS: ShortcutGroup[] = [
  {
    title: "Global & Navigation",
    items: [
      { keys: ["Ctrl", "B"], desc: "Toggle navigation sidebar" },
      { keys: ["Ctrl", "\\"], desc: "Toggle right instrument panel" },
      { keys: ["?"], desc: "Show keyboard shortcuts" },
      { keys: ["Esc"], desc: "Close drawer, modal or clear input" }
    ]
  },
  {
    title: "Review & Drill",
    items: [
      { keys: ["Space"], desc: "Show answer (or check recall)" },
      { keys: ["Ctrl", "Enter"], desc: "Check recall from memory box" },
      { keys: ["1"], desc: "Grade Again" },
      { keys: ["2"], desc: "Grade Hard" },
      { keys: ["3"], desc: "Grade Good" },
      { keys: ["4"], desc: "Grade Easy" },
      { keys: ["G"], desc: "Go deeper (chat on current card)" },
      { keys: ["N"], desc: "Log insight from card" },
      { keys: ["S"], desc: "View review statistics" }
    ]
  },
  {
    title: "Chat & AI Tutor",
    items: [
      { keys: ["Ctrl", "K"], desc: "Open command palette" },
      { keys: ["Ctrl", "J"], desc: "Start new conversation" },
      { keys: ["/"], desc: "Trigger slash commands in composer" },
      { keys: ["@"], desc: "Attach deck, note or journal reference" },
      { keys: ["Ctrl", "Enter"], desc: "Send message" }
    ]
  }
];

export default function ShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="sheet"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet-inner" style={{ maxWidth: "34rem" }}>
        <div className="sheet-head">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Icon name="keyboard" size={18} style={{ color: "var(--accent)" }} />
            <h3>Keyboard Shortcuts</h3>
          </div>
          <button className="iconbtn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="sheet-body" style={{ display: "flex", flexDirection: "column", gap: "var(--s-5)" }}>
          {SHORTCUTS.map((g) => (
            <div key={g.title}>
              <div className="label">{g.title}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-2)" }}>
                {g.items.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "var(--s-1) 0",
                      borderBottom: "1px solid var(--rule-soft)"
                    }}
                  >
                    <span style={{ fontSize: "var(--t-sm)", color: "var(--ink)" }}>{item.desc}</span>
                    <span style={{ display: "inline-flex", gap: "4px" }}>
                      {item.keys.map((k) => (
                        <kbd key={k}>{k}</kbd>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
