import { useState } from "react";
import * as store from "@/services/store";
import * as U from "@/lib/util";
import { useSheet } from "@/context/SheetContext";
import { useToast } from "@/context/ToastContext";
import SheetShell from "../SheetShell";
import type { Card } from "@/types";
import Icon from "../ui/Icon";

export default function LibraryPane({ initialFilter, mode }: { initialFilter?: string; mode?: "leech" }) {
  const [filter, setFilter] = useState(initialFilter || "");
  const { open } = useSheet();
  const toast = useToast();

  const d = store.deck();
  const f = filter.toLowerCase();
  let cards: Card[] = d.cards;
  if (mode === "leech") cards = cards.filter((c) => d.srs[c.id] && store.isLeech(d.srs[c.id]));
  if (f) cards = cards.filter((c) => (c.tag + " " + c.q + " " + c.a).toLowerCase().indexOf(f) >= 0);

  return (
    <SheetShell title={mode === "leech" ? "Leeches" : "Cards"} sub={`${d.cards.length} in deck`}>
      <input className="fi mono" placeholder="search…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      <div className="btnrow" style={{ marginBottom: 14 }}>
        <button className="btn sm" onClick={() => open({ name: "editor", deckId: d.id, cardId: null })}>
          + New card
        </button>
        <button className="btn sm" onClick={() => open({ name: "ai" })}>
          <Icon name="sparkle" size={13} /> Generate
        </button>
        <button
          className="btn sm"
          onClick={() => {
            U.download(U.slug(d.name) + ".json", store.exportDeck(d));
            toast("Exported " + d.cards.length + " cards");
          }}
        >
          Export
        </button>
      </div>
      <div className="list">
        {cards.length === 0 ? (
          <div className="empty">Nothing matches.</div>
        ) : (
          cards.map((c) => {
            const s = d.srs[c.id];
            return (
              <button key={c.id} className="item" onClick={() => open({ name: "editor", deckId: d.id, cardId: c.id })}>
                <span className="grow">
                  <span className="tagmini">
                    {c.tag}
                    {s && store.isLeech(s) ? " · leech" : ""}
                    {s && s.reps ? " · " + U.fmt(store.currentInterval(s)) : ""}
                  </span>
                  <span className="qmini" dangerouslySetInnerHTML={{ __html: c.q }}></span>
                </span>
              </button>
            );
          })
        )}
      </div>
    </SheetShell>
  );
}
