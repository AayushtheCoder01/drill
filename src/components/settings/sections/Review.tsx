/* ============================================================================
 * Review — the spaced-repetition half, in the order the questions get asked:
 * what am I drilling, how much of it today, how often does it come back, how
 * do I answer one, and who marks it.
 *
 * The first two groups used to live in the review loop itself. "Mix all decks"
 * was a switch inside a sheet you reached from the deck name in the running
 * head, which made it the one scheduling setting you could only change while
 * you were reviewing; and the size of a run was a `sessionSize` field that the
 * rail and `startSession()` both read while nothing anywhere could write it —
 * a dead dial upside down, the exact failure CONTRIBUTING names.
 * ========================================================================== */
import * as store from "@/services/store";
import { clamp } from "@/lib/util";
import { useDrillStore } from "@/hooks/useDrillStore";
import { useMaybeReview } from "@/context/ReviewContext";
import { useSettings } from "@/context/SettingsContext";
import SwitchRow from "../../ui/SwitchRow";
import TextRow from "../../ui/TextRow";
import Section from "../Section";
import type { Lang } from "@/types";

const RETENTION_OPTS: [number, string, string][] = [
  [0.85, "0.85", "lighter load"],
  [0.9, "0.90", "default"],
  [0.95, "0.95", "heavier, safer"]
];

export default function Review() {
  const db = useDrillStore();
  const s = store.settings();
  /* Settings opens far outside the review loop now, so the queue may not
     exist to refresh. Changing the active deck from chat still has to write
     through; it just has nothing to re-serve until you get there. */
  const review = useMaybeReview();
  const { open } = useSettings();
  const decks = store.decksOf(db.activeProjectId);
  const session = store.session();

  function pickDeck(id: string) {
    store.setActive(id);
    review?.refresh();
  }

  function toggleMix() {
    store.updateSettings({ mix: !s.mix });
    review?.refresh();
  }

  return (
    <>
      <Section id="review.queue">
        <SwitchRow
          title="Mix every deck in this project"
          sub={
            decks.length > 1
              ? "Interleaving beats blocking: one RCT put mixed practice at 61% against 38% a month later. Worth turning on once two decks share any maths."
              : "Needs a second deck in this project before it does anything."
          }
          on={s.mix}
          onToggle={toggleMix}
        />

        <div className="list setlist">
          {decks.map((d) => {
            const drilling = d.id === db.active && !s.mix;
            return (
              <button key={d.id} className={"item" + (drilling ? " on" : "")} onClick={() => pickDeck(d.id)}>
                <span className="grow">
                  <span className="t">{d.name}</span>
                  <span className="s">
                    {d.cards.length} {d.cards.length === 1 ? "card" : "cards"} · {Object.keys(d.srs).length} seen
                  </span>
                </span>
                <span className="state">{drilling ? "drilling" : s.mix ? "in the mix" : ""}</span>
              </button>
            );
          })}
        </div>
        <p className="sset-note">
          Picking one turns mixing off — “which deck” and “all of them” are the same question asked once. Making,
          renaming and deleting decks is on{" "}
          <button className="textlink" onClick={() => open("project", "project.decks")}>
            the project's own page
          </button>
          .
        </p>
      </Section>

      <Section id="review.run">
        <TextRow
          title="Cards in a run"
          sub="Asking for a run puts a finish line on today. The queue keeps serving after it — you just get told you have arrived."
          value={String(s.sessionSize || 10)}
          type="number"
          mono
          onCommit={(v) => store.updateSettings({ sessionSize: clamp(parseInt(v, 10) || 10, 1, 500) })}
        />
        {session ? (
          <p className="sset-note">
            A run is going: {session.done} of {session.target} done. Changing the number above re-targets it without
            losing what you have already reviewed.
          </p>
        ) : (
          <p className="sset-note">No run today. Start one from the panel beside the card.</p>
        )}
      </Section>

      <Section id="review.scheduling">
        <div className="srow">
          <span className="grow">
            <span className="t">Target retention</span>
            <span className="s">The share of cards you want to get right. Higher means shorter intervals and more reviews.</span>
          </span>
        </div>
        <div className="seg">
          {RETENTION_OPTS.map(([v, label, note]) => (
            <button
              key={v}
              className={Math.abs((s.retention || 0.9) - v) < 0.001 ? "on" : ""}
              onClick={() => store.updateSettings({ retention: v })}
            >
              {label} · {note}
            </button>
          ))}
        </div>

        <TextRow
          title="New cards per day"
          value={String(s.newPerDay || 10)}
          type="number"
          mono
          onCommit={(v) => store.updateSettings({ newPerDay: clamp(parseInt(v, 10) || 10, 1, 200) })}
        />
        <TextRow
          title="Longest interval — days"
          value={String(s.maxIvl || 365)}
          type="number"
          mono
          onCommit={(v) => store.updateSettings({ maxIvl: clamp(parseInt(v, 10) || 365, 7, 3650) })}
        />
      </Section>

      <Section id="review.answering">
        <SwitchRow
          title="Write it before you flip"
          sub="Free recall beats recognising the answer. Ctrl+Enter checks."
          on={s.recall}
          onToggle={() => store.updateSettings({ recall: !s.recall })}
        />
        <SwitchRow
          title="AI marks what you wrote"
          sub="Compares your attempt to the card and suggests a grade."
          on={s.mark}
          onToggle={() => store.updateSettings({ mark: !s.mark })}
        />
        <SwitchRow
          title="Interleave sections"
          sub="Avoids two cards from the same section back to back."
          on={s.interleave}
          onToggle={() => store.updateSettings({ interleave: !s.interleave })}
        />
      </Section>

      <Section id="review.tutor">
        <div className="srow">
          <span className="grow">
            <span className="t">Language</span>
          </span>
        </div>
        <div className="seg">
          {(["english", "hinglish"] as Lang[]).map((l) => (
            <button key={l} className={s.lang === l ? "on" : ""} onClick={() => store.updateSettings({ lang: l })}>
              {l[0].toUpperCase() + l.slice(1)}
            </button>
          ))}
        </div>

        <TextRow
          title="Tutor style"
          sub="Prepended to every marking request. Blank restores the default."
          value={s.tutor || store.DEFAULT_TUTOR}
          multiline
          onCommit={(v) => store.updateSettings({ tutor: v.trim() || store.DEFAULT_TUTOR })}
        />
      </Section>
    </>
  );
}
