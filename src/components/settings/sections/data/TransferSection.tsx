/* ============================================================================
 * TransferSection — decks and logs, one piece at a time.
 *
 * The neighbour of the full backup and not a substitute for it: these files
 * are shareable and readable, and none of them carries your chats, your
 * memory or your review history. The section says so, because "Export decks
 * and progress" sounds like everything and is not.
 * ========================================================================== */
import { useRef, useState } from "react";
import * as store from "@/services/store";
import * as U from "@/lib/util";
import { useToast } from "@/context/ToastContext";
import { useMaybeReview } from "@/context/ReviewContext";
import { useDrillStore } from "@/hooks/useDrillStore";
import Section from "../../Section";
import Item from "../../../ui/Item";
import type { ImportPayload } from "@/types";

export default function TransferSection() {
  const db = useDrillStore();
  const toast = useToast();
  const review = useMaybeReview();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ kind: "note" | "err" | "ok"; text: string } | null>(null);

  const deck = store.deck();
  const notes = db.notes || [];

  /** `source` lets a caller validate text it has in hand. Reading `text` from
   *  state would see the previous render's value — which is why loading a
   *  file used to report "Nothing pasted yet". */
  function check(source?: string): ImportPayload | null {
    const raw = (source ?? text).trim();
    if (!raw) {
      setMsg({ kind: "note", text: "Nothing pasted yet." });
      return null;
    }
    try {
      const p = store.readPayload(raw);
      if (p.kind === "backup") {
        setMsg({
          kind: "note",
          text:
            `That is a full backup — ${Object.keys(p.data.decks || {}).length} decks. ` +
            "Restore it under Back up and restore above, which shows you what it replaces first."
        });
        return p;
      }
      const v = store.validateCards(p.cards);
      setMsg({
        kind: v.ok.length ? "ok" : "err",
        text:
          `${v.ok.length} usable card${v.ok.length === 1 ? "" : "s"}` +
          (p.name ? ` · deck name "${p.name}"` : "") +
          (v.problems.length
            ? "\n" + v.problems.slice(0, 8).join("\n") + (v.problems.length > 8 ? `\n… and ${v.problems.length - 8} more` : "")
            : "")
      });
      return p;
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
      return null;
    }
  }

  function take(asNew: boolean) {
    const p = check();
    if (!p) return;
    /* A full backup is not imported from here. It replaces the database
       wholesale, which is a different question with a different confirmation
       — and answering it from a paste box, with no summary of what is about
       to be destroyed, is how you lose everything by accident. */
    if (p.kind === "backup") return;
    try {
      const v = store.validateCards(p.cards);
      if (!v.ok.length) throw new Error("No usable cards in there.");
      if (asNew) {
        const n = window.prompt("Name the new deck:", p.name || "Imported");
        if (!n) return;
        store.addDeck(n, v.ok);
      } else {
        store.addCards(deck, v.ok);
      }
      const n = `${v.ok.length} card${v.ok.length === 1 ? "" : "s"}`;
      setText("");
      review?.refresh();
      toast(n + " imported");
      setMsg({ kind: "ok", text: `${n} imported.` });
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      const raw = String(rd.result);
      setText(raw);
      check(raw);
      toast("Loaded " + f.name + " — now pick where it goes");
    };
    rd.readAsText(f);
  }

  return (
    <>
      <Section
        title="Export a piece"
        sub="Readable, shareable files. None of these carries your chats, your memory or your review history — that is what the full backup above is for."
      >
        <div className="list">
          <Item
            title="This deck"
            sub={`${deck.name} · ${deck.cards.length} cards, no progress`}
            chev="↓"
            onClick={() => {
              U.download(U.slug(deck.name) + ".json", store.exportDeck(deck));
              toast("Exported");
            }}
          />
          <Item
            title="Every deck, with progress"
            sub="all decks and their scheduling — no chats, journal or memory"
            chev="↓"
            onClick={() => {
              U.download("drill-decks-" + U.today() + ".json", store.exportAll());
              toast("Exported");
            }}
          />
          <Item
            title="The insight log"
            sub={`${notes.length} ${notes.length === 1 ? "entry" : "entries"} as markdown`}
            chev="↓"
            onClick={() => {
              if (!notes.length) {
                toast("Log is empty");
                return;
              }
              const md =
                "# Insight log\n\n" +
                notes
                  .map((x) => "## " + new Date(x.t).toDateString() + " · " + (x.tag || "") + "\n\n" + x.text + "\n")
                  .join("\n");
              U.download("insight-log.md", md, "text/markdown");
              toast("Exported");
            }}
          />
        </div>
      </Section>

      <Section
        title="Import cards"
        sub={`A deck file, or a bare list of cards. They land in "${deck.name}" or in a deck of their own — nothing else in the app is touched.`}
      >
        <textarea
          className="fi"
          placeholder='[{"tag":"Notation","q":"…","a":"<p>…</p>"}]'
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="btnrow">
          <button className="btn pri" onClick={() => take(false)}>
            Add to this deck
          </button>
          <button className="btn sm" onClick={() => take(true)}>
            As new deck
          </button>
          <button className="btn sm" onClick={() => fileRef.current?.click()}>
            From file…
          </button>
          <button className="btn sm" onClick={() => check()}>
            Validate
          </button>
        </div>
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden-file" onChange={onFile} />

        {msg && (
          <>
            {msg.kind === "note" && <div className="note">{msg.text}</div>}
            {msg.kind === "err" && <div className="err prewrap">{msg.text}</div>}
            {msg.kind === "ok" && <div className="hintline ok prewrap">{msg.text}</div>}
          </>
        )}
      </Section>
    </>
  );
}
