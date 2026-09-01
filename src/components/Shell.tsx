/* ============================================================================
 * Shell — the frame every section is rendered into.
 *
 *   .app                     fixed, a row: rail on the left, everything else
 *     <Sidebar/>             the one navigation
 *     .app-main              a column
 *       .topbar              only under 900px: the drawer handle
 *       .app-body            a row
 *         .app-col           a column
 *           {children}       the section, which owns its own scrolling
 *           .app-dock        optional: the grade bar
 *         <aside .app-rail>  optional: the instrument panel
 *
 * The sidebar, the dock and the rail are all siblings of the scroll
 * container, never inside it, which is what makes it impossible to scroll the
 * navigation off the screen — the bug this shell was built around. The rail
 * is subject to the same rule for the same reason: a panel that tells you how
 * far through today you are is worthless if the page can push it away.
 * ========================================================================== */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import * as store from "@/services/store";
import { useDrillStore } from "@/hooks/useDrillStore";
import type { View } from "@/context/RouteContext";
import Sidebar from "./Sidebar";
import Icon from "./ui/Icon";

const MOBILE = "(max-width: 900px)";

const TITLES: Record<View, string> = {
  drill: "Review",
  journal: "Journal",
  exam: "Exam",
  chat: "Chat"
};

export default function Shell({
  current,
  sidebar,
  dock,
  aside,
  children
}: {
  current: View;
  /** Extra sidebar content for this section, under the section list. */
  sidebar?: ReactNode;
  /** Docked below the scroll area — the grade bar. */
  dock?: ReactNode;
  /** The right-hand instrument panel. Hidden below 1180px, where the reading
   *  column needs the width more than the readouts do. */
  aside?: ReactNode;
  children: ReactNode;
}) {
  const db = useDrillStore();
  const [drawer, setDrawer] = useState(false);
  const [mobile, setMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia(MOBILE).matches
  );

  useEffect(() => {
    const mq = window.matchMedia(MOBILE);
    const sync = () => {
      setMobile(mq.matches);
      // Widening the window with the drawer open would otherwise leave the
      // scrim over a sidebar that is now docked in the layout anyway.
      if (!mq.matches) setDrawer(false);
    };
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  /* Collapsing is a desktop idea. On a phone the same control opens the
     drawer, and Settings.navCollapsed is left alone so the two devices do
     not overwrite each other's preference. */
  const collapsed = !mobile && !!db.settings.navCollapsed;

  const toggle = useCallback(() => {
    if (window.matchMedia(MOBILE).matches) setDrawer((v) => !v);
    else store.updateSettings({ navCollapsed: !store.settings().navCollapsed });
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggle();
      } else if (e.key === "Escape" && drawer) {
        setDrawer(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [toggle, drawer]);

  return (
    <div className={"app" + (collapsed ? " nav-collapsed" : "")}>
      <Sidebar
        current={current}
        collapsed={collapsed}
        open={drawer}
        onToggle={toggle}
        onNavigate={() => setDrawer(false)}
      >
        {sidebar}
      </Sidebar>

      {drawer && <div className="nav-scrim" onClick={() => setDrawer(false)} />}

      <div className="app-main">
        <div className="topbar">
          <button className="iconbtn" onClick={toggle} aria-label="Open navigation" aria-expanded={drawer}>
            <Icon name="panel" />
          </button>
          <span className="topbar-title">{TITLES[current]}</span>
        </div>

        <div className="app-body">
          <div className="app-col">
            {children}

            {dock && (
              <div className="app-dock">
                <div className="dock-inner">{dock}</div>
              </div>
            )}
          </div>

          {aside && <aside className="app-rail">{aside}</aside>}
        </div>
      </div>
    </div>
  );
}
