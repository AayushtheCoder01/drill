/* ============================================================================
 * ProposalsBlock — shared by every card-generating surface: the AI pane, the
 * leech fix pane, "turn this note into cards", and "make cards from this
 * reply" in chat.
 *
 * Deliberately has no opinion about what happens after the cards land —
 * callers pass `onCommitted`, because the drill panes want to close a sheet
 * and re-render the queue while the chat view wants to stay exactly where it
 * is.
 * ========================================================================== */
import { useState } from "react";
import * as store from "@/services/store";
import { useToast } from "@/context/ToastContext";
import type { Card, Deck, QueueItem } from "@/types";
import CardHtml from "./CardHtml";

export default function ProposalsBlock({
  label,
  cards,
  replaceItem,
  targetDeck,
  sourceRef,
  onCommitted
}: {
  label: string;
  cards: Card[];
  replaceItem?: QueueItem | null;
  /** where "Add" puts them; defaults to the active deck */
  targetDeck?: Deck;
  /** Stamped onto every card committed, so the review screen can show
   *  "from your log on 12 March" and a bad card can be traced to its day. */
  sourceRef?: Card["sourceRef"];
  onCommitted?: (cards: Card[]) => void;
}) {
  const [on, setOn] = useState<boolean[]>(() => cards.map(() => true));
  const toast = useToast();

  const kept = () => cards.filter((_, i) => on[i]).map((c) => (sourceRef ? { ...c, sourceRef } : c));
  const chosenCount = on.filter(Boolean).length;

  function commitAdd() {
    const k = kept();
    if (!k.length) {
      toast("Nothing selected");
      return;
    }
    if (replaceItem) {
      store.replaceCard(replaceItem.deck, replaceItem.def.id, k);
    } else {
      store.addCards(targetDeck || store.deck(), k);
    }
    toast(k.length + " cards in");
    onCommitted?.(k);
  }

  function commitNewDeckOrKeepBoth() {
    const k = kept();
    if (!k.length) {
      toast("Nothing selected");
      return;
    }
    if (replaceItem) {
      store.addCards(replaceItem.deck, k);
      toast("Added alongside the original");
      onCommitted?.(k);
      return;
    }
    const n = window.prompt("Name the new deck:", "");
    if (!n) return;
    const nd = store.addDeck(n, k);
    toast(`Deck "${nd.name}" created`);
    onCommitted?.(k);
  }

  return (
    <>
      <label className="f">{label}</label>
      {cards.map((c, i) => (
        <div key={c.id || i} className={"prop" + (on[i] ? "" : " off")}>
          <div className="ph">
            <button
              className={"toggle" + (on[i] ? " on" : "")}
              onClick={() => setOn((prev) => prev.map((v, j) => (j === i ? !v : v)))}
            >
              {on[i] ? "✓" : ""}
            </button>
            <div className="grow">
              <span className="tagmini">{c.tag}</span>
              <CardHtml className="qmini" html={c.q} />
            </div>
          </div>
          <CardHtml className="pa" html={c.a} />
        </div>
      ))}
      <div className="btnrow" style={{ marginTop: 12 }}>
        <button className="btn pri" onClick={commitAdd}>
          {replaceItem ? "Replace the old card" : `Add ${chosenCount} card${chosenCount === 1 ? "" : "s"}`}
        </button>
        <button className="btn sm" onClick={commitNewDeckOrKeepBoth}>
          {replaceItem ? "Keep both" : "New deck…"}
        </button>
      </div>
    </>
  );
}
