/* ============================================================================
 * Memory — the policy, the tray, and everything already remembered.
 *
 * These three were in three places and none of them was here. The policy was
 * the bottom half of the Chat page, because that is where the effort dial
 * lived and it had to go somewhere. The tray and the store were sheet panes
 * mounted only by the review loop, opened only from its Menu — so what the
 * assistant knows about you was, of every screen in the app, visible from
 * exactly the one that never uses it.
 *
 * They belong together because they are one question asked three ways: what is
 * it allowed to keep, what does it want to keep, and what has it kept.
 * ========================================================================== */
import * as store from "@/services/store";
import { useDrillStore } from "@/hooks/useDrillStore";
import { useSettings } from "@/context/SettingsContext";
import SelectRow from "../../ui/SelectRow";
import Section from "../Section";
import PendingTray from "./memory/PendingTray";
import MemoryStore from "./memory/MemoryStore";
import type { Autonomy } from "@/types";

export default function Memory() {
  useDrillStore();
  const s = store.settings();
  const { open } = useSettings();
  const project = store.activeProject();

  return (
    <>
      <Section id="memory.policy">
        <SelectRow
          title="Autonomy"
          sub="The floor for every space. A project may hold itself to something stricter."
          value={s.autonomy}
          onChange={(v) => store.updateSettings({ autonomy: v as Autonomy })}
          options={[
            { value: "manual", label: "Manual — nothing saved without review" },
            { value: "assisted", label: "Assisted — what you stated outright commits, the rest waits" },
            { value: "auto", label: "Auto — save what looks worth keeping" }
          ]}
        />
        <p className="sset-note">
          {project.name} is currently set to <b>{project.memoryPolicy.autonomy}</b>.{" "}
          <button className="textlink" onClick={() => open("project", "project.memory")}>
            Change it there
          </button>
          .
        </p>
      </Section>

      <PendingTray />
      <MemoryStore />
    </>
  );
}
