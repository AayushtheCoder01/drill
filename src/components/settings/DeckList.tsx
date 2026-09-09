/* ============================================================================
 * DeckList — everything that makes, renames, empties or destroys a deck.
 *
 * This was three window.prompt() calls and a window.confirm() inside the
 * review loop's deck sheet: a sheet mounted only while the review loop is on
 * screen, so from chat, home, the journal or the exam view none of it existed.
 * It is here for the same reason backup is — a deck belongs to a project, and
 * "what does this space own" is a settings question.
 *
 * Which deck you are *drilling* is deliberately not here. That is a Review
 * setting, it changes what the next card is, and it belongs beside the mixing
 * switch rather than beside a delete button.
 *
 * Deleting is two clicks with the count in between rather than a confirm()
 * dialog, because the browser's dialog blocks the whole page and says only
 * "Are you sure?" — the number of cards about to go is the part that decides
 * it.
 * ========================================================================== */
import { useEffect, useState } from "react";
import * as store from "@/services/store";
import { useToast } from "@/context/ToastContext";
import { useMaybeReview } from "@/context/ReviewContext";
import type { Deck, Project } from "@/types";

function DeckRow({ deck, others, onGone }: { deck: Deck; others: Project[]; onGone: () => void }) {
  const toast = useToast();
  const review = useMaybeReview();
  const [name, setName] = useState(deck.name);
  const [confirming, setConfirming] = useState<"delete" | "reset" | null>(null);

  /* Re-seed when the stored name changes underneath — the store trims and
     truncates on the way in, and a field still showing what you typed after
     the store kept something shorter is a field that lies. */
  useEffect(() => setName(deck.name), [deck.name]);

  const seen = Object.keys(deck.srs).length;

  function commitName() {
    const next = name.trim();
    if (!next || next === deck.name) {
      setName(deck.name);
      return;
    }
    store.renameDeck(deck.id, next);
  }

  return (
    <div className="deckrow">
      <div className="deckrow-head">
        <input
          className="fi"
          value={name}
          aria-label={`Name of the deck currently called ${deck.name}`}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitName();
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        {others.length > 0 && (
          <select
            className="fi auto"
            value=""
            aria-label={`Move ${deck.name} to another project`}
            onChange={(e) => {
              if (!e.target.value) return;
              store.setDeckProject(deck.id, e.target.value);
              review?.refresh();
              toast(`Moved “${deck.name}”`);
            }}
          >
            <option value="">Move to…</option>
            {others.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* No streak here on purpose. deck.meta.streak is a per-deck counter
          that only advances while that deck is in the queue, so printing it
          beside the one Home and the rail compute from the log gives two
          different answers to the same question in the same session. The
          streak has one definition; it lives in lib/activity. */}
      <div className="deckrow-meta">
        {deck.cards.length} {deck.cards.length === 1 ? "card" : "cards"} · {seen} seen ·{" "}
        {deck.meta.reviews.toLocaleString()} reviews
      </div>

      <div className="btnrow">
        {confirming === "reset" ? (
          <>
            <button
              className="btn sm danger"
              onClick={() => {
                store.resetProgress(deck);
                review?.refresh();
                setConfirming(null);
                toast(`Cleared scheduling for “${deck.name}”`);
              }}
            >
              Clear {seen} card{seen === 1 ? "'s" : "s'"} progress
            </button>
            <button className="btn sm" onClick={() => setConfirming(null)}>
              Cancel
            </button>
          </>
        ) : confirming === "delete" ? (
          <>
            <button
              className="btn sm danger"
              onClick={() => {
                store.deleteDeck(deck.id);
                review?.refresh();
                setConfirming(null);
                onGone();
              }}
            >
              Delete it and its {deck.cards.length} card{deck.cards.length === 1 ? "" : "s"}
            </button>
            <button className="btn sm" onClick={() => setConfirming(null)}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button className="btn sm" disabled={!seen} onClick={() => setConfirming("reset")}>
              Reset progress
            </button>
            <button className="btn sm danger" onClick={() => setConfirming("delete")}>
              Delete
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function DeckList({ projectId }: { projectId: string }) {
  const toast = useToast();
  const [name, setName] = useState("");

  const decks = store.decksOf(projectId);
  const others = Object.values(store.projects()).filter((p) => p.id !== projectId && !p.archived);

  function add() {
    const n = name.trim();
    if (!n) return;
    /* Not made active: a brand-new empty deck taking over the review queue
       hands you an empty queue and no explanation. */
    store.addDeck(n, [], false, projectId);
    setName("");
    toast(`Added “${n}”`);
  }

  return (
    <>
      <div className="decklist">
        {decks.map((d) => (
          <DeckRow key={d.id} deck={d} others={others} onGone={() => toast("Deleted")} />
        ))}
        {!decks.length && <div className="empty">No decks here yet.</div>}
      </div>

      <div className="setrow-inline">
        <input
          className="fi"
          placeholder="name a new deck"
          value={name}
          aria-label="Name a new deck"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button className="btn sm" disabled={!name.trim()} onClick={add}>
          Add deck
        </button>
      </div>
      {/* Every project is guaranteed a deck of its own — deck() is read as
          non-null in a dozen components — so the store makes one rather than
          letting the last go. Saying so beats deleting the last deck and
          finding "New deck" sitting there unexplained. */}
      {decks.length === 1 && (
        <p className="sset-note">
          A project always keeps at least one deck, so deleting the last one leaves an empty deck in its place
          rather than nothing.
        </p>
      )}
    </>
  );
}
