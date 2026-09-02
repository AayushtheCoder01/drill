import { useState } from "react";
import * as store from "@/services/store";
import * as AI from "@/services/ai";
import * as U from "@/lib/util";
import { useToast } from "@/context/ToastContext";
import { useSheet } from "@/context/SheetContext";
import { useReview } from "@/context/ReviewContext";
import SheetShell from "../SheetShell";
import ProposalsBlock from "../ProposalsBlock";
import type { Card } from "@/types";
import Icon from "../ui/Icon";
import Working from "../ui/Working";

export default function NotesPane({ card }: { card: { tag: string } | null }) {
  const toast = useToast();
  const { close } = useSheet();
  const review = useReview();
  const db = store.get();
  const notes = db.notes || (db.notes = []);

  const [text, setText] = useState("");
  const [genFor, setGenFor] = useState<string | null>(null);
  const [genCards, setGenCards] = useState<Card[] | null>(null);
  const [genError, setGenError] = useState<string | null>(null);

  function save() {
    const t = text.trim();
    if (!t) {
      toast("Nothing to log");
      return;
    }
    store.addNote(t, card ? card.tag : db.settings.mix ? "mixed" : store.deck().name);
    toast("Logged");
    setText("");
  }

  function exportLog() {
    if (!notes.length) {
      toast("Log is empty");
      return;
    }
    const md =
      "# Insight log\n\n" +
      notes.map((x) => "## " + new Date(x.t).toDateString() + " · " + (x.tag || "") + "\n\n" + x.text + "\n").join("\n");
    U.download("insight-log.md", md, "text/markdown");
    toast("Exported");
  }

  function turnIntoCards(id: string) {
    const note = notes.find((x) => x.id === id);
    if (!note) return;
    setGenFor(id);
    setGenCards(null);
    setGenError(null);
    AI.generateCards("notes", note.text, 4, "This is the learner's own insight, written in their words. Keep their angle, sharpen the wording.")
      .then((cards) => setGenCards(cards))
      .catch((e: Error) => setGenError(e.message));
  }

  return (
    <SheetShell title="Insight log" sub={`${notes.length} entries`}>
      <label className="f">What clicked?</label>
      <textarea
        className="fi"
        style={{ minHeight: 110 }}
        placeholder="the thing you understood, in your own words"
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoFocus={!!card}
      />
      <div className="btnrow" style={{ marginBottom: 18 }}>
        <button className="btn pri" onClick={save}>
          Log it
        </button>
        <button className="btn sm" onClick={exportLog}>
          Export log
        </button>
      </div>

      <div>
        {notes.length === 0 ? (
          <div className="empty">
            Nothing logged yet. This is the place for the sentence you would want to read back in a month — the thing
            that finally clicked, not the definition.
          </div>
        ) : (
          notes
            .slice()
            .reverse()
            .map((n) => (
              <div key={n.id} className="logent">
                <div className="lt">
                  <span>{n.tag || "note"}</span>
                  <span>{U.ago(n.t)}</span>
                </div>
                <div className="lb">{n.text}</div>
                <div className="la">
                  <button className="linkbtn" onClick={() => turnIntoCards(n.id)}>
                    <Icon name="sparkle" size={12} /> turn into cards
                  </button>
                  <button
                    className="linkbtn"
                    onClick={() => {
                      store.deleteNote(n.id);
                      if (genFor === n.id) {
                        setGenFor(null);
                        setGenCards(null);
                      }
                    }}
                  >
                    delete
                  </button>
                </div>
              </div>
            ))
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        {genFor && genError && <div className="err">{genError}</div>}
        {genFor && !genError && !genCards && (
          <div className="empty">
            <Working stages={["reading your note", "finding what is worth recalling", "writing the cards"]} />
          </div>
        )}
        {genFor && genCards && (
          <ProposalsBlock
            label="From your insight"
            cards={genCards}
            onCommitted={() => {
              close();
              review.refresh();
            }}
          />
        )}
      </div>
    </SheetShell>
  );
}
