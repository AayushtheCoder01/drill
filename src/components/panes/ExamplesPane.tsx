import { useEffect, useState } from "react";
import * as store from "@/services/store";
import * as CFG from "@/lib/config";
import { useSheet } from "@/context/SheetContext";
import { useReview } from "@/context/ReviewContext";
import { useToast } from "@/context/ToastContext";
import SheetShell from "../SheetShell";
import type { ExampleDeckEntry } from "@/types";
import Working from "../ui/Working";

export default function ExamplesPane() {
  const { close } = useSheet();
  const review = useReview();
  const toast = useToast();
  const base = (CFG.get().decks.defaultPath || "/decks").replace(/\/+$/, "") + "/examples/";

  const [list, setList] = useState<ExampleDeckEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addingIdx, setAddingIdx] = useState<number | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  useEffect(() => {
    fetch(base + "index.json", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error("no index.json (" + r.status + ")");
        return r.json();
      })
      .then((data: ExampleDeckEntry[]) => {
        if (!Array.isArray(data) || !data.length) throw new Error("index.json is empty");
        setList(data);
      })
      .catch((e: Error) => setError("Could not list example decks: " + e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function add(i: number, d: ExampleDeckEntry) {
    setAddingIdx(i);
    setRowError(null);
    fetch(base + d.file, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(d.file + " — " + r.status);
        return r.text();
      })
      .then((txt) => {
        const p = store.readPayload(txt);
        if (p.kind !== "cards") throw new Error(d.file + " is not a deck");
        const v = store.validateCards(p.cards);
        if (!v.ok.length) throw new Error("No usable cards in " + d.file);
        store.addDeck(p.name || d.name || d.file, v.ok);
        close();
        review.refresh();
        toast(`Added "${p.name || d.name}" · ${v.ok.length} cards`);
      })
      .catch((e: Error) => {
        setRowError(e.message);
        setAddingIdx(null);
      });
  }

  return (
    <SheetShell title="Example decks" sub={"from " + base}>
      {!list && !error && (
        <div className="empty">
          <Working stages={["looking for a worked example", "picking one that actually shows the step"]} />
        </div>
      )}
      {error && <div className="err">{error}</div>}
      {list && (
        <div className="list">
          {list.map((d, i) => (
            <button key={d.file} className="item" disabled={addingIdx === i} onClick={() => add(i, d)}>
              <span className="grow">
                <span className="t">{d.name || d.file}</span>
                <span className="s">{(d.cards != null ? d.cards + " cards · " : "") + (d.description || d.file)}</span>
              </span>
              <span className="x">+</span>
            </button>
          ))}
        </div>
      )}
      {rowError && <div className="err">{rowError}</div>}
    </SheetShell>
  );
}
