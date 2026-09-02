import { useState } from "react";
import * as store from "@/services/store";
import { clean, fmt } from "@/lib/util";
import { useSheet } from "@/context/SheetContext";
import { useReview } from "@/context/ReviewContext";
import { useToast } from "@/context/ToastContext";
import SheetShell from "../SheetShell";
import CardHtml from "../CardHtml";

export default function EditorPane({ deckId, cardId }: { deckId: string; cardId: string | null }) {
  const { close } = useSheet();
  const review = useReview();
  const toast = useToast();

  /* A deck can vanish under an open sheet — deleted from Decks, or the last
     deck removed while the Cards page had its editor queued. Reading through
     an undefined deck used to throw, which the sheet's ErrorGuard turned into
     the panel silently disappearing. Saying so is better than vanishing. */
  const deck = store.get().decks[deckId];
  const c = cardId && deck ? deck.cards.find((x) => x.id === cardId) || null : null;
  const s = c && deck ? deck.srs[c.id] : null;

  const [tag, setTag] = useState(c ? c.tag : "General");
  const [q, setQ] = useState(c ? c.q : "");
  const [a, setA] = useState(c ? c.a : "");

  function save() {
    const nc = store.normCard({ id: c ? c.id : undefined, tag, q, a });
    if (!nc.q.trim() || !nc.a.trim()) {
      toast("Needs a front and a back");
      return;
    }
    store.upsertCard(deck, nc);
    toast(c ? "Saved" : "Card added");
    review.refresh();
    // Back to wherever you opened it from. It used to jump to the deck-scoped
    // Library sheet, which since the Cards section exists is both redundant
    // and the wrong destination when you arrived from anywhere else.
    close();
  }

  function del() {
    if (!c) return;
    if (!window.confirm("Delete this card?")) return;
    store.deleteCard(deck, c.id);
    review.refresh();
    close();
    toast("Deleted");
  }

  if (!deck) {
    return (
      <SheetShell title="Card" sub="deck missing">
        <div className="empty">That deck no longer exists — it was probably deleted while this was open.</div>
      </SheetShell>
    );
  }

  return (
    <SheetShell title={c ? "Edit card" : "New card"} sub={deck.name}>
      {s && s.reps ? (
        <div className="hintline">
          Seen {s.reps} times · {s.lapses || 0} lapses · interval {fmt(store.currentInterval(s))} · difficulty{" "}
          {Math.round(s.D * 10) / 10}/10
        </div>
      ) : null}

      <label className="f">Section</label>
      <input className="fi mono" value={tag} onChange={(e) => setTag(e.target.value)} />

      <label className="f">Prompt — front</label>
      <textarea className="fi" style={{ minHeight: 74 }} value={q} onChange={(e) => setQ(e.target.value)} />

      <label className="f">Answer — back (html ok)</label>
      <textarea className="fi" style={{ minHeight: 150 }} value={a} onChange={(e) => setA(e.target.value)} />

      <label className="f">Preview</label>
      <div className="prop">
        <div className="ph">
          <div className="grow">
            <span className="tagmini">{tag}</span>
            <CardHtml className="qmini" html={clean(q)} />
          </div>
        </div>
        <CardHtml className="pa" html={clean(a)} />
      </div>

      <div className="btnrow">
        <button className="btn pri" onClick={save}>
          Save
        </button>
        <button className="btn sm" onClick={close}>
          Cancel
        </button>
        {c && (
          <button className="btn sm danger" onClick={del}>
            Delete
          </button>
        )}
      </div>
    </SheetShell>
  );
}
