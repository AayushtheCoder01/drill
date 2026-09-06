/* ============================================================================
 * SettingsPanel — the review loop's entry into the unified settings system.
 * ========================================================================== */
import SheetShell from "../SheetShell";
import SettingsHome from "./SettingsHome";

export default function SettingsPanel() {
  return (
    <SheetShell title="Settings" sub="everything, by category">
      <SettingsHome />
    </SheetShell>
  );
}
