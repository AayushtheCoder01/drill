import * as store from "@/services/store";
import { useSheet } from "@/context/SheetContext";
import { useReview } from "@/context/ReviewContext";
import SheetShell from "../SheetShell";
import SwitchRow from "../ui/SwitchRow";
import Icon from "../ui/Icon";

export default function DecksPane() {
  const { close } = useSheet();
  const review = useReview();
  const db = store.get();
  const ids = store.decksOf(db.activeProjectId).map((d) => d.id);

  function toggleMix() {
    db.settings.mix = !db.settings.mix;
    store.saveNow();
    review.refresh();
  }

  function pick(id: string) {
    store.setActive(id);
    close();
    review.refresh();
  }

  function del(id: string) {
    const dd = db.decks[id];
    if (!window.confirm(`Delete "${dd.name}" and its ${dd.cards.length} cards? This cannot be undone.`)) return;
    store.deleteDeck(id);
    review.refresh();
  }

  function newDeck() {
    const n = window.prompt("Name the new deck:", "");
    if (!n) return;
    store.addDeck(n, []);
    close();
    review.refresh();
  }

  function rename() {
    const n = window.prompt("Rename deck:", store.deck().name);
    if (!n) return;
    store.renameDeck(db.active, n);
  }

  function resetProgress() {
    const d = store.deck();
    if (!window.confirm(`Clear scheduling for "${d.name}"? The cards stay, the progress goes.`)) return;
    store.resetProgress(d);
    review.refresh();
  }

  return (
    <SheetShell title="Decks" sub={`${ids.length} total`}>
      <SwitchRow
        title="Mix all decks"
        sub={
          ids.length > 1
            ? "Interleaving beats blocking: one RCT put mixed practice at 61% vs 38% a month later. Turn this on once two decks share maths."
            : "Needs a second deck before it does anything."
        }
        on={db.settings.mix}
        onToggle={toggleMix}
      />

      <div className="list" style={{ marginTop: 14 }}>
        {ids.map((id) => {
          const d = db.decks[id];
          return (
            <button key={id} className={"item" + (id === db.active && !db.settings.mix ? " on" : "")} onClick={() => pick(id)}>
              <span className="grow">
                <span className="t">{d.name}</span>
                <span className="s">
                  {d.cards.length} cards · {Object.keys(d.srs).length} seen
                </span>
              </span>
              {ids.length > 1 ? (
                <span
                  className="x"
                  onClick={(e) => {
                    e.stopPropagation();
                    del(id);
                  }}
                >
                  <Icon name="close" size={12} />
                </span>
              ) : (
                <span className="x">·</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="btnrow" style={{ marginTop: 14 }}>
        <button className="btn sm" onClick={newDeck}>
          + New deck
        </button>
        <button className="btn sm" onClick={rename}>
          Rename current
        </button>
        <button className="btn sm danger" onClick={resetProgress}>
          Reset progress
        </button>
      </div>
    </SheetShell>
  );
}
