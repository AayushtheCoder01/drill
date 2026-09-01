import { useState } from "react";
import * as store from "@/services/store";
import { clean, fmt } from "@/lib/util";
import { useSheet } from "@/context/SheetContext";
import { useReview } from "@/context/ReviewContext";
import { useToast } from "@/context/ToastContext";
import SheetShell from "../SheetShell";
import CardHtml from "../CardHtml";

export default function EditorPane({ deckId, cardId }: { deckId: string; cardId: string | null }) {
  const { open } = useSheet();
  const review = useReview();
  const toast = useToast();

  const deck = store.get().decks[deckId];
  const c = cardId ? deck.cards.find((x) => x.id === cardId) || null : null;
  const s = c ? deck.srs[c.id] : null;

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
    open({ name: "library" });
  }

  function del() {
    if (!c) return;
    if (!window.confirm("Delete this card?")) return;
    store.deleteCard(deck, c.id);
    review.refresh();
    open({ name: "library" });
    toast("Deleted");
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
        <button className="btn sm" onClick={() => open({ name: "library" })}>
          Back
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
