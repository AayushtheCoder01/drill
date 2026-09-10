/* ============================================================================
 * CardsView — everything you have written down, in one place.
 *
 * Until now a card could only be seen through the deck it happened to live in,
 * from a sheet buried in the review menu, and the things that *produce* cards
 * — a journal entry, a memory, a note — had no way back to them. That is a
 * broken loop: you write something down every day and it goes nowhere.
 *
 * This section closes it. The top of the page is the day's raw material, each
 * line with one action: turn this into cards. Below it is the whole library,
 * project-wide rather than deck-scoped, filterable by the four states that
 * actually matter (due, new, learning, leech).
 *
 * Editing reuses the same EditorPane the review loop uses, so a card has one
 * editor and only one — which is why this view mounts SheetProvider and
 * ReviewProvider around itself.
 * ========================================================================== */
import { useEffect, useMemo, useState } from "react";
import * as store from "@/services/store";
import * as journalStore from "@/services/journalStore";
import * as memoryStore from "@/services/memoryStore";
import { useDrillStore } from "@/hooks/useDrillStore";
import { useStoreSync } from "@/hooks/useStoreSync";
import { useRoute } from "@/context/RouteContext";
import { SheetProvider, useSheet } from "@/context/SheetContext";
import { ReviewProvider } from "@/context/ReviewContext";
import { ago, fmt, stripTags, today as todayKey } from "@/lib/util";
import Shell from "../Shell";
import Sheet from "../Sheet";
import CardHtml from "../CardHtml";
import CardsRail from "../rail/CardsRail";
import Icon from "../ui/Icon";
import type { Card, Deck } from "@/types";
import "@/styles/cards.css";

type Filter = "all" | "due" | "new" | "learning" | "leech";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "due", label: "Due" },
  { id: "new", label: "Unseen" },
  { id: "learning", label: "Learning" },
  { id: "leech", label: "Slipping" }
];

type Sort = "new" | "due" | "hard" | "az";

const SORTS: { id: Sort; label: string }[] = [
  { id: "new", label: "Newest" },
  { id: "due", label: "Due soonest" },
  { id: "hard", label: "Hardest" },
  { id: "az", label: "A–Z" }
];

const PAGE = 150;

interface Row {
  card: Card;
  deck: Deck;
  state: Filter;
  /** Current interval in minutes, 0 for unseen. */
  ivl: number;
  /** Timestamp, or Infinity for a card with no due date yet — unseen is not
   *  "due now", so it sorts to the end of "Due soonest" rather than the front. */
  due: number;
  lapses: number;
}

function compareRows(a: Row, b: Row, sort: Sort): number {
  if (sort === "due") return a.due - b.due;
  if (sort === "hard") return b.lapses - a.lapses || b.card.a.length - a.card.a.length;
  if (sort === "az") {
    const ta = a.card.tag.toLowerCase();
    const tb = b.card.tag.toLowerCase();
    if (ta !== tb) return ta < tb ? -1 : 1;
    const qa = stripTags(a.card.q).toLowerCase();
    const qb = stripTags(b.card.q).toLowerCase();
    return qa < qb ? -1 : qa > qb ? 1 : 0;
  }
  return 0; // "new": rows already arrive newest-first, sort() is stable
}

/** Which of the four states a card is in. One function, so the filter chips,
 *  the counts beside them and the note on each row can never disagree. */
function stateOf(deck: Deck, card: Card): Filter {
  const st = deck.srs[card.id];
  if (!st || !st.reps) return "new";
  if (store.isLeech(st)) return "leech";
  if (st.due <= Date.now()) return "due";
  return "learning";
}

function CardsPage() {
  const db = useDrillStore();
  useStoreSync(journalStore);
  useStoreSync(memoryStore);
  const { projectId, openJournal } = useRoute();
  const { pane, open } = useSheet();

  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [deckId, setDeckId] = useState("");
  const [sort, setSort] = useState<Sort>("new");
  const [visible, setVisible] = useState(PAGE);

  const project = db.projects[projectId];
  const decks = store.decksOf(projectId);

  const rows = useMemo(() => {
    const out: Row[] = [];
    for (const d of decks) {
      for (const c of d.cards) {
        const st = d.srs[c.id];
        out.push({
          card: c,
          deck: d,
          state: stateOf(d, c),
          ivl: st && st.reps ? store.currentInterval(st) : 0,
          due: st && st.reps ? st.due : Infinity,
          lapses: st ? st.lapses || 0 : 0
        });
      }
    }
    // Newest first: the card you just made is the one you want to check.
    return out.reverse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, projectId]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: rows.length, due: 0, new: 0, learning: 0, leech: 0 };
    for (const r of rows) c[r.state]++;
    return c;
  }, [rows]);

  const q = query.trim().toLowerCase();
  const shown = useMemo(() => {
    const matched = rows.filter((r) => {
      if (filter !== "all" && r.state !== filter) return false;
      if (deckId && r.deck.id !== deckId) return false;
      if (!q) return true;
      return (r.card.tag + " " + stripTags(r.card.q) + " " + stripTags(r.card.a)).toLowerCase().includes(q);
    });
    return sort === "new" ? matched : [...matched].sort((a, b) => compareRows(a, b, sort));
  }, [rows, filter, deckId, q, sort]);

  // Narrowing the view is a fresh look at it — carrying the old page size
  // forward would either hide a card that now matches or leave "load more"
  // showing a count from before the filter changed.
  useEffect(() => setVisible(PAGE), [filter, deckId, q, sort]);

  const grouped = !deckId && decks.length > 1;
  const paged = shown.slice(0, visible);
  const byDeck = useMemo(() => {
    if (!grouped) return null;
    const m = new Map<string, Row[]>();
    for (const r of paged) {
      const list = m.get(r.deck.id);
      if (list) list.push(r);
      else m.set(r.deck.id, [r]);
    }
    return decks.map((d) => ({ deck: d, rows: m.get(d.id) || [] })).filter((g) => g.rows.length > 0);
  }, [grouped, paged, decks]);

  /* The front rendered as real HTML — LaTeX included — and a one-line
     preview of the back, which this list never showed before: you had to
     open the editor just to see what a card actually answered. */
  function cardRow(r: Row) {
    return (
      <li key={r.card.id}>
        <button className="cardrow" onClick={() => open({ name: "editor", deckId: r.deck.id, cardId: r.card.id })}>
          <CardHtml as="span" className="cardrow-q" html={r.card.q} />
          <CardHtml as="span" className="cardrow-a" html={r.card.a} />
          <span className="cardrow-meta">
            <span className={"cardrow-state " + r.state}>{r.state === "new" ? "unseen" : r.state}</span>
            {r.ivl > 0 && <span>{fmt(r.ivl)}</span>}
            <span className="cardrow-tag">{r.card.tag}</span>
          </span>
        </button>
      </li>
    );
  }

  /* The day's raw material. Everything here is something you wrote that has
     not yet become a card — which is the whole point of showing it on this
     page rather than leaving it in the section that produced it. */
  const entry = journalStore.byDay(projectId, todayKey());
  const recentMemories = memoryStore
    .list({ scope: "project", projectId, activeOnly: true })
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 4);

  function cardsFromEntry() {
    if (!entry || !entry.summary) return;
    const s = entry.summary;
    const text = [
      s.narrative,
      s.learned.length ? "Learned:\n" + s.learned.map((x) => "- " + x).join("\n") : "",
      s.stuck.length ? "Got stuck on:\n" + s.stuck.map((x) => "- " + x).join("\n") : "",
      s.open.length ? "Left open:\n" + s.open.map((x) => "- " + x).join("\n") : ""
    ]
      .filter(Boolean)
      .join("\n\n");
    open({ name: "ai", source: text, sourceLabel: "today's journal entry" });
  }

  if (!project) return null;

  const seen = rows.length - counts.new;

  return (
    <Shell current="cards" aside={<CardsRail rows={rows} counts={counts} />} asideLabel="Library">
      <div className="app-scroll">
        <div className="page cards">
          <header className="cards-head">
            <div className="home-folio">
              {project.name} · {rows.length} card{rows.length === 1 ? "" : "s"} · {seen} seen
            </div>
            <h2>Cards</h2>
            <p className="home-epigraph">
              {rows.length === 0
                ? "Nothing written down yet. A card is one idea you want back in six months."
                : `Everything you have written down, across ${decks.length} deck${decks.length === 1 ? "" : "s"}.`}
            </p>
            <div className="home-rule" />
          </header>

          {/* ---------- today's raw material ---------- */}
          {(entry?.summary || recentMemories.length > 0) && (
            <section className="home-sec">
              <h3 className="home-sec-h">
                <span>Worth turning into cards</span>
                <span className="home-sec-note">from what you wrote</span>
              </h3>
              <div className="src-list">
                {entry?.summary && (
                  <div className="src">
                    <div className="src-txt">
                      <span className="src-kind">today's entry</span>
                      <span className="src-line">{entry.summary.narrative || "written, not yet distilled"}</span>
                    </div>
                    <div className="src-acts">
                      <button className="btn sm" onClick={() => openJournal()}>
                        Open
                      </button>
                      <button className="btn sm pri" onClick={cardsFromEntry}>
                        Make cards
                      </button>
                    </div>
                  </div>
                )}
                {recentMemories.map((m) => (
                  <div className="src" key={m.id}>
                    <div className="src-txt">
                      <span className="src-kind">
                        {m.type} · {ago(m.updatedAt)}
                      </span>
                      <span className="src-line">{m.text}</span>
                    </div>
                    <div className="src-acts">
                      <button
                        className="btn sm"
                        onClick={() => open({ name: "ai", source: m.text, sourceLabel: "a memory" })}
                      >
                        Make cards
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ---------- the library ---------- */}
          <section className="home-sec">
            <h3 className="home-sec-h">
              <span>The library</span>
              <span className="home-sec-note">
                {shown.length === rows.length ? `${rows.length} cards` : `${shown.length} of ${rows.length}`}
              </span>
            </h3>

            <div className="cards-tools">
              <input
                className="fi"
                placeholder="search fronts, backs and tags…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button className="btn sm" onClick={() => open({ name: "editor", deckId: (decks[0] || {}).id, cardId: null })} disabled={!decks.length}>
                <Icon name="plus" size={13} /> New
              </button>
              <button className="btn sm pri" onClick={() => open({ name: "ai" })}>
                <Icon name="sparkle" size={13} /> Generate
              </button>
            </div>

            <div className="cfilters">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  className={"cfilter" + (filter === f.id ? " on" : "")}
                  data-filter={f.id}
                  onClick={() => setFilter(f.id)}
                  disabled={f.id !== "all" && counts[f.id] === 0}
                >
                  {f.label}
                  <span className="cfilter-n">{counts[f.id]}</span>
                </button>
              ))}
              {decks.length > 1 && (
                <select className="cfilter-sel" value={deckId} onChange={(e) => setDeckId(e.target.value)}>
                  <option value="">Every deck</option>
                  {decks.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              )}
              <select className="cfilter-sel" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            {shown.length === 0 ? (
              <p className="home-empty">
                {rows.length === 0 ? "No cards in this project yet — generate some, or write one by hand." : "Nothing matches."}
              </p>
            ) : byDeck ? (
              byDeck.map(({ deck, rows: rs }) => (
                <div className="cardgroup" key={deck.id}>
                  <h4 className="cardgroup-h">
                    <span>{deck.name}</span>
                    <span className="cardgroup-n">{rs.length}</span>
                  </h4>
                  <ul className="cardlist">{rs.map(cardRow)}</ul>
                </div>
              ))
            ) : (
              <ul className="cardlist">{paged.map(cardRow)}</ul>
            )}
            {shown.length > visible && (
              <button className="btn sm" style={{ marginTop: 12 }} onClick={() => setVisible((v) => v + PAGE)}>
                Show {Math.min(PAGE, shown.length - visible)} more
              </button>
            )}
          </section>
        </div>
      </div>
      <Sheet pane={pane} />
    </Shell>
  );
}

export default function CardsView() {
  return (
    <SheetProvider>
      <ReviewProvider>
        <CardsPage />
      </ReviewProvider>
    </SheetProvider>
  );
}
