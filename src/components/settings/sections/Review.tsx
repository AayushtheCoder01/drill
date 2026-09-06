/* ============================================================================
 * Review — the spaced-repetition half: how a card is answered, how often it
 * comes back, and how the tutor talks while marking it.
 * ========================================================================== */
import * as store from "@/services/store";
import { clamp } from "@/lib/util";
import { useDrillStore } from "@/hooks/useDrillStore";
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
  useDrillStore();
  const s = store.settings();

  return (
    <>
      <Section title="Answering" sub="What happens between seeing a question and grading yourself on it.">
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

      <Section title="Scheduling" sub="How much comes back, and how soon. These feed FSRS directly.">
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

      <Section title="The tutor" sub="Who is marking your answers, and in what language.">
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
