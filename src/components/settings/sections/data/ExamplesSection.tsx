/* ============================================================================
 * ExamplesSection — the decks that ship with Drill, one click from a deck of
 * your own.
 *
 * Was a sheet pane behind Menu → Import / export → Example decks, which is
 * three clicks and a section of the app away from the empty state it exists
 * to answer. It is a list of files; it does not need a screen.
 *
 * The list is fetched, not bundled: examples are static files under
 * /decks/examples so anyone forking this can drop a deck in the folder
 * without touching the build.
 * ========================================================================== */
import { useEffect, useState } from "react";
import * as store from "@/services/store";
import * as CFG from "@/lib/config";
import { useToast } from "@/context/ToastContext";
import { useMaybeReview } from "@/context/ReviewContext";
import Section from "../../Section";
import type { ExampleDeckEntry } from "@/types";

export default function ExamplesSection() {
  const toast = useToast();
  const review = useMaybeReview();
  const base = (CFG.get().decks.defaultPath || "/decks").replace(/\/+$/, "") + "/examples/";

  const [list, setList] = useState<ExampleDeckEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(base + "index.json", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error("no index.json (" + r.status + ")");
        return r.json();
      })
      .then((data: ExampleDeckEntry[]) => {
        if (!Array.isArray(data) || !data.length) throw new Error("index.json is empty");
        if (live) setList(data);
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [base]);

  function add(d: ExampleDeckEntry) {
    setAdding(d.file);
    setError(null);
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
        review?.refresh();
        toast(`Added "${p.name || d.name}" · ${v.ok.length} cards`);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setAdding(null));
  }

  /* A missing index.json is the normal state of a fork that has not added
     any examples, so it says nothing rather than showing an error for a
     feature the reader never asked about. */
  if (error && !list) return null;

  return (
    <Section title="Example decks" sub="The decks that ship with Drill. Each one is added as a new deck in this project.">
      {!list && <div className="empty">Looking…</div>}
      {list && (
        <div className="list">
          {list.map((d) => (
            <button key={d.file} className="item" disabled={adding === d.file} onClick={() => add(d)}>
              <span className="grow">
                <span className="t">{d.name || d.file}</span>
                <span className="s">{(d.cards != null ? d.cards + " cards · " : "") + (d.description || d.file)}</span>
              </span>
              <span className="go">{adding === d.file ? "…" : "+"}</span>
            </button>
          ))}
        </div>
      )}
      {error && <div className="err">{error}</div>}
    </Section>
  );
}
