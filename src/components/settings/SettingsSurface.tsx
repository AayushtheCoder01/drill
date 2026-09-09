/* ============================================================================
 * SettingsSurface — the one settings window, in every section of the app.
 *
 * There were three of these. A modal off the sidebar; a drawer inside chat
 * with its own head, its own close button and its own escape handling; and a
 * review-loop sheet pane that no code had opened since the sheet router
 * gained it. Three surfaces meant three things could be true at once about
 * where a setting was, and the review loop's Menu quietly became a fourth
 * place settings-shaped things could live — which is where backup and restore
 * ended up, unreachable from five of the six sections.
 *
 * Shell renders this, once, and Shell is the one component every section
 * agrees on. Rendering it here rather than at the app root is what lets a
 * category read a context its own view provides: in chat this sits inside
 * ChatProvider, so "This chat" has a conversation to configure.
 *
 * SettingsHome is lazy on purpose. It reaches the pricing catalogue, the
 * usage ledger, the backup writer and every scope panel — none of which the
 * review loop's first paint should be waiting on, and none of which anyone
 * needs until they open this.
 * ========================================================================== */
import { Suspense, lazy, useEffect, useRef } from "react";
import { useSettings } from "@/context/SettingsContext";
import Icon from "../ui/Icon";

const SettingsHome = lazy(() => import("./SettingsHome"));

export default function SettingsSurface() {
  const { cat, close } = useSettings();
  const panelRef = useRef<HTMLDivElement | null>(null);

  /* Focus moves into the panel when it opens, so Escape and Tab land here
     rather than in whatever was behind it — and so a keyboard user is not
     left tabbing through the page under the scrim. */
  useEffect(() => {
    if (cat) panelRef.current?.focus();
  }, [cat]);

  if (!cat) return null;

  return (
    <div
      className="sheet"
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="sheet-inner" ref={panelRef} tabIndex={-1}>
        <div className="sheet-head">
          <h3>Settings</h3>
          <span className="sub">everything, by category</span>
          <button className="iconbtn" onClick={close} aria-label="Close settings">
            <Icon name="close" />
          </button>
        </div>
        <div className="sheet-body">
          <Suspense fallback={<div className="empty">Opening…</div>}>
            <SettingsHome />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
