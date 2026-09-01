import * as store from "@/services/store";
import { useSheet } from "@/context/SheetContext";
import Icon from "./ui/Icon";

export default function Done() {
  const { open } = useSheet();
  const c = store.counts();
  const up = store.nextDue();
  const decks = store.pool();
  let seen = 0,
    total = 0,
    reviews = 0,
    streak = 0;
  decks.forEach((d) => {
    seen += Object.keys(d.srs).length;
    total += d.cards.length;
    reviews += d.meta.reviews;
    streak = Math.max(streak, d.meta.streak);
  });

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
      <div className="msg">
        <h2>{head}</h2>
        <p>{body}</p>
        <p className="stat">
          {seen} of {total} seen · {reviews} reviews · {streak} day streak
        </p>
      </div>
      <div className="controls">
        {!total || c.unseen > 0 ? (
          <button className="btn pri wide" onClick={() => open({ name: "ai" })}>
            <Icon name="sparkle" /> Make cards with AI
          </button>
        ) : (
          <button className="btn wide" onClick={() => open({ name: "notes", card: null })}>
            Log an insight from today
          </button>
        )}
      </div>
    </main>
  );
}
