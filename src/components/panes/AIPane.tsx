import { useState } from "react";
import * as AI from "@/services/ai";
import { useSheet } from "@/context/SheetContext";
import { useReview } from "@/context/ReviewContext";
import SheetShell from "../SheetShell";
import ProposalsBlock from "../ProposalsBlock";
import type { Card } from "@/types";

export default function AIPane() {
  const { close } = useSheet();
  const review = useReview();
  const [mode, setMode] = useState<"topic" | "notes">("topic");
  const [src, setSrc] = useState("");
  const [n, setN] = useState("10");
  const [focus, setFocus] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cards, setCards] = useState<Card[] | null>(null);

  const r = AI.resolve();
  const readiness = AI.ready();

  function go() {
    const source = src.trim();
    if (!source) {
      setError(mode === "topic" ? "Give it a topic" : "Paste some notes");
      return;
    }
    setBusy(true);
    setError(null);
    setCards(null);
    AI.generateCards(mode, source, n, focus.trim())
      .then((out) => setCards(out))
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  }

  return (
    <SheetShell title="Make cards" sub={r.model ? `${r.backend.label} · ${r.model}` : "no model set"}>
      {!readiness.ok && <div className="note">{readiness.why}</div>}

      <div className="tabs">
        <button className={"tab" + (mode === "topic" ? " on" : "")} onClick={() => setMode("topic")}>
          From a topic
        </button>
        <button className={"tab" + (mode === "notes" ? " on" : "")} onClick={() => setMode("notes")}>
          From notes
        </button>
      </div>

      {mode === "topic" ? (
        <>
          <label className="f">Topic</label>
          <input
            className="fi"
            placeholder="e.g. logistic regression: sigmoid, decision boundary, log loss"
            value={src}
            onChange={(e) => setSrc(e.target.value)}
          />
        </>
      ) : (
        <>
          <label className="f">Your notes</label>
          <textarea
            className="fi"
            style={{ minHeight: 180 }}
            placeholder="paste lecture notes, a transcript, a textbook section…"
            value={src}
            onChange={(e) => setSrc(e.target.value)}
          />
        </>
      )}

      <label className="f">How many</label>
      <select className="fi" value={n} onChange={(e) => setN(e.target.value)}>
        <option>6</option>
        <option>10</option>
        <option>15</option>
        <option>20</option>
      </select>

      <label className="f">Extra instruction — optional</label>
      <input
        className="fi"
        placeholder="e.g. heavy on shapes and traps, assume I know the basics"
        value={focus}
        onChange={(e) => setFocus(e.target.value)}
      />

      <button className="btn pri wide" disabled={busy} onClick={go}>
        {busy ? "Writing cards…" : "Generate"}
      </button>

      <div style={{ marginTop: 18 }}>
        {busy && (
          <div className="empty">
            <span className="spin"></span> thinking — 10 to 40 seconds
          </div>
        )}
        {error && <div className="err">{error}</div>}
        {cards && (
          <ProposalsBlock
            label={`${cards.length} cards — untick anything weak`}
            cards={cards}
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
