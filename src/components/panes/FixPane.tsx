import { useState } from "react";
import * as AI from "@/services/ai";
import { useSheet } from "@/context/SheetContext";
import { useReview } from "@/context/ReviewContext";
import SheetShell from "../SheetShell";
import ProposalsBlock from "../ProposalsBlock";
import type { Card, QueueItem } from "@/types";
import CardHtml from "../CardHtml";
import Working from "../ui/Working";

export default function FixPane({ item }: { item: QueueItem }) {
  const { close } = useSheet();
  const review = useReview();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cards, setCards] = useState<Card[] | null>(null);

  function go() {
    setBusy(true);
    setError(null);
    setCards(null);
    AI.splitCard(item.def, item.st.lapses)
      .then((out) => setCards(out))
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  }

  return (
    <SheetShell title="Rewrite this card" sub={`${item.st.lapses || 0} lapses`}>
      <div className="hintline">
        A card you keep failing is usually a card asking for too much at once. The fix is not more repetitions — it is
        splitting it into atomic pieces.
      </div>
      <div className="prop">
        <div className="ph">
          <div className="grow">
            <span className="tagmini">{item.def.tag}</span>
            <CardHtml className="qmini" html={item.def.q} />
          </div>
        </div>
        <div className="pa" dangerouslySetInnerHTML={{ __html: item.def.a }}></div>
      </div>
      <button className="btn pri wide" style={{ marginTop: 14 }} disabled={busy} onClick={go}>
        {busy ? "Rewriting…" : "Split it into atomic cards"}
      </button>
      <div style={{ marginTop: 18 }}>
        {busy && (
          <div className="empty">
            <Working stages={["reading the card", "finding where it holds two ideas", "splitting it"]} />
          </div>
        )}
        {error && <div className="err">{error}</div>}
        {cards && (
          <ProposalsBlock
            label="Replacements"
            cards={cards}
            replaceItem={item}
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
