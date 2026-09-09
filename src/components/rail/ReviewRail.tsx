/* ============================================================================
 * ReviewRail — what today looks like, beside the card.
 *
 * The review queue is endless by design, which makes progress invisible: you
 * cannot tell a good day from a bad one while you are inside it. This is the
 * readout that fixes that — the day's run, what is waiting, the streak, and
 * the cards you keep getting wrong.
 *
 * Everything here is computed live from the store (START-HERE §2.6: never
 * memorise what can be computed).
 * ========================================================================== */
import * as store from "@/services/store";
import { useDrillStore } from "@/hooks/useDrillStore";
import { useSheet } from "@/context/SheetContext";
import { streaks } from "@/lib/activity";
import { DAY, stripTags } from "@/lib/util";
import { RailBar, RailEmpty, RailFigure, RailGroup, RailItem, RailList, RailSub, RailWeek } from "./Rail";

/** Seven booleans, oldest first, ending today: was anything reviewed that day?
 *  Read straight off the review log rather than stored anywhere.
 *
 *  Scoped to what you are actually drilling. It read the whole of db.log
 *  before, so a week spent in another project lit this one's streak up — and
 *  disagreed with Home, which has always filtered. */
function weekOfActivity(): boolean[] {
  const log = store.logOf(store.projectDecks());
  const midnight = new Date().setHours(0, 0, 0, 0);
  const days: boolean[] = [];
  for (let i = 6; i >= 0; i--) {
    const from = midnight - i * DAY;
    const to = from + DAY;
    days.push(log.some((e) => e.t >= from && e.t < to));
  }
  return days;
}

/** The cards costing the most: leeches first, then most-lapsed. Same ordering
 *  the chat context uses for its "weak" source, so the rail and the tutor
 *  agree about what you are bad at. */
function worstCards(limit: number) {
  const out: { id: string; deckId: string; text: string; lapses: number }[] = [];
  for (const d of store.pool()) {
    for (const c of d.cards) {
      const st = d.srs[c.id];
      if (!st || !st.reps || !st.lapses) continue;
      out.push({ id: c.id, deckId: d.id, text: stripTags(c.q), lapses: st.lapses });
    }
  }
  out.sort((a, b) => b.lapses - a.lapses);
  return out.slice(0, limit);
}

export default function ReviewRail() {
  useDrillStore();
  const { open } = useSheet();

  const s = store.stats();
  const counts = store.counts();
  const session = store.session();
  const week = weekOfActivity();
  const worst = worstCards(4);
  /* Computed from the log by the same function Home uses, over the same
     project scope, rather than read off `deck.meta.streak`. The stored
     counter is per deck and only advances for decks that happen to be in
     pool() when rollover() runs, so it drifted — Home said "day 6" and this
     said "3 days", about the same week, on the same screen if you had both
     open. START-HERE §2.6: never memorise what can be computed. */
  const streak = streaks(store.logOf(store.projectDecks())).current;
  const retention = s.rev > 0 ? Math.round((s.ok / s.rev) * 100) : null;
  const target = store.settings().sessionSize || 10;

  return (
    <>
      <RailGroup title="Today" note={session ? `${session.done}/${session.target}` : undefined}>
        {session ? (
          <>
            <RailBar value={session.done} max={session.target} />
            <RailSub>
              {session.done >= session.target
                ? `Run finished — ${session.done} card${session.done === 1 ? "" : "s"}. Keep going if you like.`
                : `${session.target - session.done} to go · ${s.today} reviewed today`}
            </RailSub>
            <button className="rail-item" onClick={() => store.endSession()}>
              <span className="rail-item-mark">×</span>
              <span className="rail-item-text">End the run</span>
            </button>
          </>
        ) : (
          <>
            <RailFigure value={s.today} unit={s.today === 1 ? "card" : "cards"} muted={s.today === 0} />
            <RailSub>reviewed today, no finish line set</RailSub>
            <button className="btn sm" onClick={() => store.startSession(target)}>
              Run {target} cards
            </button>
          </>
        )}
      </RailGroup>

      <RailGroup title="Waiting">
        <RailFigure value={counts.due} unit={counts.due === 1 ? "due" : "due"} muted={counts.due === 0} />
        <RailSub>
          {counts.newLeft > 0
            ? `${counts.newLeft} new card${counts.newLeft === 1 ? "" : "s"} still allowed today`
            : counts.unseen > 0
              ? "new-card limit reached for today"
              : "every card in this project has been seen"}
        </RailSub>
      </RailGroup>

      <RailGroup title="Streak" note={streak > 0 ? `${streak} day${streak === 1 ? "" : "s"}` : undefined}>
        <RailWeek days={week} />
        <RailSub>{s.last7} reviews in the last seven days</RailSub>
      </RailGroup>

      <RailGroup title="Retention" note="30 days">
        {retention === null ? (
          <RailEmpty>Not enough reviews yet.</RailEmpty>
        ) : (
          <>
            <RailFigure value={`${retention}%`} />
            <RailSub>
              {`against a ${Math.round(store.settings().retention * 100)}% target · ${s.rev} graded`}
            </RailSub>
          </>
        )}
      </RailGroup>

      <RailGroup title="Keeps slipping">
        {worst.length === 0 ? (
          <RailEmpty>Nothing has lapsed yet.</RailEmpty>
        ) : (
          <RailList>
            {worst.map((w) => (
              <RailItem
                key={w.id}
                mark={`${w.lapses}×`}
                text={w.text}
                onClick={() => open({ name: "editor", deckId: w.deckId, cardId: w.id })}
              />
            ))}
          </RailList>
        )}
      </RailGroup>
    </>
  );
}
