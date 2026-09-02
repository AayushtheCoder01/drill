/* ============================================================================
 * CardsModal — "make cards from this reply".
 *
 * The single most valuable bridge between the two halves of the app: an
 * explanation you just understood is exactly when the cards should be
 * written, and a tab-switch away is enough friction that it never happens.
 * ========================================================================== */
import { useEffect, useState } from "react";
import * as AI from "@/services/ai";
import * as store from "@/services/store";
import ProposalsBlock from "../ProposalsBlock";
import { useToast } from "@/context/ToastContext";
import type { Card, Deck } from "@/types";
import Icon from "../ui/Icon";
import Working from "../ui/Working";

export default function CardsModal({ source, onClose }: { source: string; onClose: () => void }) {
  const toast = useToast();
  const db = store.get();
  const [deckId, setDeckId] = useState(db.active);
  const [count, setCount] = useState("6");
  const [focus, setFocus] = useState("");
  const [busy, setBusy] = useState(false);
  const [cards, setCards] = useState<Card[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function generate() {
    setBusy(true);
    setError(null);
    setCards(null);
    AI.generateCards("notes", source, count, focus.trim())
      .then(setCards)
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  }

  const projectDecks = store.decksOf(db.activeProjectId);
  const target: Deck | undefined = db.decks[deckId];
  const preview = source.length > 420 ? source.slice(0, 420) + "…" : source;

  return (
    <div
      className="sheet"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet-inner">
        <div className="sheet-head">
          <h3>Make cards from this</h3>
          <span className="sub">{source.length.toLocaleString()} chars</span>
          <button className="iconbtn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="sheet-body">
          <label className="f">Source</label>
          <div className="prop">
            <div className="pa" style={{ whiteSpace: "pre-wrap", borderTop: "none", marginTop: 0, paddingTop: 0 }}>
              {preview}
            </div>
          </div>

          <label className="f">Into which deck</label>
          <select className="fi" value={deckId} onChange={(e) => setDeckId(e.target.value)}>
            {projectDecks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.cards.length} cards)
              </option>
            ))}
          </select>

          <label className="f">How many</label>
          <select className="fi" value={count} onChange={(e) => setCount(e.target.value)}>
            <option>3</option>
            <option>6</option>
            <option>10</option>
            <option>15</option>
          </select>

          <label className="f">Extra instruction — optional</label>
          <input
            className="fi"
            placeholder="e.g. only the parts I got wrong, heavy on shapes"
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
          />

          <button className="btn pri wide" onClick={generate} disabled={busy}>
            {busy ? "Writing cards…" : cards ? "Regenerate" : "Generate"}
          </button>

          <div style={{ marginTop: 18 }}>
            {busy && (
              <div className="empty">
                <Working stages={["reading the conversation", "picking out what is worth keeping", "writing the cards", "cutting the ones that need an “and”"]} />
              </div>
            )}
            {error && <div className="err">{error}</div>}
            {cards && (
              <ProposalsBlock
                label={`${cards.length} cards — untick anything weak`}
                cards={cards}
                targetDeck={target}
                onCommitted={(added) => {
                  toast(`${added.length} cards added to ${target?.name || "deck"}`);
                  onClose();
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
