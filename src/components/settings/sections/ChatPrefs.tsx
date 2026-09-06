/* ============================================================================
 * ChatPrefs — the defaults every new conversation starts from.
 *
 * Effort and memory autonomy are here because they had nowhere else to be.
 * Both are the bottom of an inheritance chain — a project or a conversation
 * that has not overridden them falls through to `settings.effort` and
 * `settings.autonomy` — and both were read by the send path while being
 * settable nowhere in the app. The project and conversation pickers offered
 * "inherit from global" for a global value the user could not reach, which is
 * the dead dial upside down: not a control that changes nothing, but a value
 * that changes things with no control.
 * ========================================================================== */
import * as store from "@/services/store";
import { EFFORT_ORDER, effortMeans } from "@/lib/effort";
import { useDrillStore } from "@/hooks/useDrillStore";
import SwitchRow from "../../ui/SwitchRow";
import SelectRow from "../../ui/SelectRow";
import Section from "../Section";
import type { Autonomy, Effort } from "@/types";

export default function ChatPrefs() {
  useDrillStore();
  const s = store.settings();
  const effort: Effort = s.effort || "medium";

  return (
    <>
      <Section title="Chat defaults" sub="Where a conversation starts. Any thread can override all of this from the composer.">
        <div className="srow">
          <span className="grow">
            <span className="t">Effort</span>
            <span className="s">{effortMeans(effort, "direct")}</span>
          </span>
        </div>
        <div className="seg">
          {EFFORT_ORDER.map((e) => (
            <button key={e} className={effort === e ? "on" : ""} onClick={() => store.updateSettings({ effort: e })}>
              {e[0].toUpperCase() + e.slice(1)}
            </button>
          ))}
        </div>

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
      </Section>

      <Section title="Memory" sub="What the assistant is allowed to remember about you without being told to.">
        <SelectRow
          title="Autonomy"
          sub="A project can be stricter than this, never looser."
          value={s.autonomy}
          onChange={(v) => store.updateSettings({ autonomy: v as Autonomy })}
          options={[
            { value: "manual", label: "Manual — nothing saved without review" },
            { value: "assisted", label: "Assisted — what you stated outright commits, the rest waits" },
            { value: "auto", label: "Auto — save what looks worth keeping" }
          ]}
        />
      </Section>
    </>
  );
}
