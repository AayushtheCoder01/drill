/* ============================================================================
 * ChatPrefs — the defaults every new conversation starts from.
 *
 * Effort is here because it had nowhere else to be. It is the bottom of an
 * inheritance chain — a project or a conversation that has not overridden it
 * falls through to `settings.effort` — and it was read by the send path while
 * being settable nowhere in the app. The project and conversation pickers
 * offered "inherit from global" for a global value the user could not reach,
 * which is the dead dial upside down: not a control that changes nothing, but
 * a value that changes things with no control.
 *
 * Memory autonomy used to be the second half of this page for the same reason.
 * It has its own page now, next to the tray and the memories themselves, which
 * is where somebody looking for it would actually go.
 * ========================================================================== */
import * as store from "@/services/store";
import { EFFORT_ORDER, effortMeans } from "@/lib/effort";
import { useDrillStore } from "@/hooks/useDrillStore";
import { useSettings } from "@/context/SettingsContext";
import SwitchRow from "../../ui/SwitchRow";
import Section from "../Section";
import type { Effort } from "@/types";

export default function ChatPrefs() {
  useDrillStore();
  const s = store.settings();
  const { open } = useSettings();
  const effort: Effort = s.effort || "medium";

  return (
    <>
      <Section id="chat.effort">
        <div className="seg">
          {EFFORT_ORDER.map((e) => (
            <button key={e} className={effort === e ? "on" : ""} onClick={() => store.updateSettings({ effort: e })}>
              {e[0].toUpperCase() + e.slice(1)}
            </button>
          ))}
        </div>
        <p className="sset-note">{effortMeans(effort, "direct")}</p>
      </Section>

      <Section id="chat.requests">
        <SwitchRow
          title="Suggest follow-up questions"
          sub="Costs a second request after every reply. Off at low effort regardless."
          on={s.followups}
          onToggle={() => store.updateSettings({ followups: !s.followups })}
        />
        <SwitchRow
          title="Name conversations automatically"
          sub="One extra request per new thread, never per message. Off names it from your first line instead."
          on={s.autoTitle}
          onToggle={() => store.updateSettings({ autoTitle: !s.autoTitle })}
        />
        <p className="sset-note">
          What a conversation is allowed to remember is on the{" "}
          <button className="textlink" onClick={() => open("memory")}>
            Memory page
          </button>
          .
        </p>
      </Section>
    </>
  );
}
