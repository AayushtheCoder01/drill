/* ============================================================================
 * SettingsPanel — the review loop's entry into the unified settings system.
 * Replaces panes/SettingsPane.tsx.
 * ========================================================================== */
import SheetShell from "../SheetShell";
import GlobalProjectTabs from "./GlobalProjectTabs";

export default function SettingsPanel() {
  return (
    <SheetShell title="Settings" sub="global · project">
      <GlobalProjectTabs />
    </SheetShell>
  );
}
