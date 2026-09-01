/* ============================================================================
 * Header — the review section's chapter opening.
 *
 * Where you are in the book (deck, and what is left of it today) plus the
 * two actions that belong to this section. Everything that was navigation
 * between sections moved to Sidebar, which is the same in every view; what
 * is left here is only ever about the deck in front of you.
 * ========================================================================== */
import { useDrillStore } from "@/hooks/useDrillStore";
import * as store from "@/services/store";
import { useSheet } from "@/context/SheetContext";
import Icon from "./ui/Icon";

export default function Header() {
  const db = useDrillStore();
  const { open } = useSheet();
  const c = store.counts();
  const nDecks = store.decksOf(db.activeProjectId).length;
  const deckLabel = db.settings.mix && nDecks > 1 ? `Mixed · ${nDecks} decks` : store.deck().name;

  return (
    <div className="chapter">
      <div className="chapter-eyebrow folio">
        <span className="due">
          <span className="dot"></span>
          {c.due} due
        </span>
        <span className="new">
          <span className="dot"></span>
          {c.newLeft} new
        </span>
      </div>

      <div className="chapter-head">
        <button className="deckbtn" onClick={() => open({ name: "decks" })} aria-label="Switch deck">
          <span id="deck-name">{deckLabel}</span>
          <Icon name="chevron" size={12} className="chev" />
        </button>

        <div className="chapter-aside">
          <button className="iconbtn" onClick={() => open({ name: "ai" })} title="Make cards with AI" aria-label="Make cards with AI">
            <Icon name="sparkle" />
          </button>
          <button className="iconbtn" onClick={() => open({ name: "menu" })} title="Menu" aria-label="Menu">
            <Icon name="more" />
          </button>
        </div>
      </div>

      <div className="chapter-rule"></div>
    </div>
  );
}
