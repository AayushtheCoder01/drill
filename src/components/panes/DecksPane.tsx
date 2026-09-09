/* ============================================================================
 * DecksPane — which deck the next card comes from. A switcher, not a manager.
 *
 * It used to be both, and the manager half was the problem: making, renaming,
 * emptying and destroying a deck sat behind three window.prompt() calls in a
 * sheet the review loop is the only view that mounts, so from chat, home, the
 * journal or the exam view none of it existed. That half is Settings →
 * Project → Decks now, in a real form.
 *
 * What stays is the one question you ask *mid-session* — which of these am I
 * drilling — because it is one click from the deck name in the running head
 * and it should stay that way. "Mix all decks" stays with it because it is the
 * same question asked once rather than a separate setting: picking a deck
 * turns mixing off, and store.setActive() is what enforces that.
 *
 * Both controls have their proper home on the Review page, which is where the
 * signpost at the foot goes. This is the shortcut, not the truth.
 * ========================================================================== */
import * as store from "@/services/store";
import { useSheet } from "@/context/SheetContext";
import { useReview } from "@/context/ReviewContext";
import { useSettings } from "@/context/SettingsContext";
import SheetShell from "../SheetShell";
import SwitchRow from "../ui/SwitchRow";
import Item from "../ui/Item";

export default function DecksPane() {
  const { close } = useSheet();
  const review = useReview();
  const settings = useSettings();
  const db = store.get();
  const decks = store.decksOf(db.activeProjectId);

  function toggleMix() {
    store.updateSettings({ mix: !db.settings.mix });
    review.refresh();
  }

  function pick(id: string) {
    store.setActive(id);
    close();
    review.refresh();
  }

  return (
    <SheetShell title="What you're drilling" sub={`${decks.length} ${decks.length === 1 ? "deck" : "decks"}`}>
      <SwitchRow
        title="Mix all decks"
        sub={
          decks.length > 1
            ? "Interleaving beats blocking: one RCT put mixed practice at 61% against 38% a month later. Turn this on once two decks share any maths."
            : "Needs a second deck before it does anything."
        }
        on={db.settings.mix}
        onToggle={toggleMix}
      />

      <div className="list">
        {decks.map((d) => {
          const drilling = d.id === db.active && !db.settings.mix;
          return (
            <button key={d.id} className={"item" + (drilling ? " on" : "")} onClick={() => pick(d.id)}>
              <span className="grow">
                <span className="t">{d.name}</span>
                <span className="s">
                  {d.cards.length} {d.cards.length === 1 ? "card" : "cards"} · {Object.keys(d.srs).length} seen
                </span>
              </span>
              <span className="state">{drilling ? "drilling" : db.settings.mix ? "in the mix" : ""}</span>
            </button>
          );
        })}
      </div>

      <div className="label">In Settings</div>
      <div className="list">
        <Item
          title="Make, rename and delete decks"
          sub="and move one to another project, or clear its progress"
          onClick={() => {
            close();
            settings.open("project", "project.decks");
          }}
        />
      </div>
    </SheetShell>
  );
}
