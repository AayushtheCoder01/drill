import * as store from "@/services/store";
import { useSheet } from "@/context/SheetContext";
import { useRoute } from "@/context/RouteContext";
import { streaks } from "@/lib/activity";
import Icon from "./ui/Icon";

export default function Done() {
  const { open } = useSheet();
  const { openHome, openCards } = useRoute();
  const c = store.counts();
  const up = store.nextDue();
  const decks = store.pool();
  let seen = 0,
    total = 0,
    reviews = 0;
  decks.forEach((d) => {
    seen += Object.keys(d.srs).length;
    total += d.cards.length;
    reviews += d.meta.reviews;
  });
  /* The same computed, project-scoped streak Home and the rail show. It used
     to be max(deck.meta.streak), which is a different number arrived at a
     different way and disagreed with both. */
  const streak = streaks(store.logOf(store.projectDecks())).current;

  const cap = store.settings().newPerDay || 10;
  let head: string, body: string;
  if (!total) {
    head = "Empty deck";
    body = "Nothing in here yet. Make some cards with AI, or import a deck.";
  } else if (c.unseen > 0 && c.newLeft === 0) {
    head = "Done for now";
    body = `You have hit today's ${cap} new cards. ${c.unseen} still waiting — they unlock tomorrow.`;
  } else if (up) {
    head = "Done for now";
    body = `Everything due is cleared. Next card comes back in ${up}.`;
  } else {
    head = "Done for now";
    body = "Every card is scheduled well out. Come back tomorrow.";
  }

  return (
    <main id="stage">
      <div className="msg done-msg">
        <div className="done-badge" aria-hidden="true">
          <Icon name="check" size={28} />
        </div>
        <h2>{head}</h2>
        <p>{body}</p>
        <p className="stat">
          {seen} of {total} seen · {reviews} reviews · {streak} day streak
        </p>
      </div>
      <div className="controls">
        <div className="done-acts">
          {!total || c.unseen > 0 ? (
            <button className="btn pri wide" onClick={() => open({ name: "ai" })}>
              <Icon name="sparkle" /> Make cards with AI
            </button>
          ) : (
            <button className="btn pri wide" onClick={() => open({ name: "notes", card: null })}>
              <Icon name="journal" /> Log an insight from today
            </button>
          )}
          <div className="done-acts-row">
            <button className="btn" onClick={openCards}>
              <Icon name="cards" size={15} /> Library
            </button>
            <button className="btn" onClick={openHome}>
              <Icon name="home" size={15} /> Home
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
