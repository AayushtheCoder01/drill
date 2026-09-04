import * as FSRS from "@/lib/fsrs";
import * as store from "@/services/store";
import { useReview } from "@/context/ReviewContext";
import { fmt } from "@/lib/util";

const LABELS = ["Again", "Hard", "Good", "Easy"];

export default function Controls() {
  const review = useReview();
  const { current, revealed, recall } = { ...review, recall: store.settings().recall };

  if (!current) return null; // Done owns its own .controls in that state

  if (!revealed) {
    return (
      <div className="controls">
        <button className="flip" onClick={() => review.reveal()}>
          {recall ? "Check" : "Show the answer"}
          <span className="hint">{recall ? "ctrl + enter" : "say it out loud first"}</span>
        </button>
      </div>
    );
  }

  const pv = FSRS.previewMinutes(current.st, store.params());
  const suggestedIdx = review.lastMark ? review.lastMark.grade - 1 : -1;

  return (
    <div className="controls">
      <div className="grades">
        {LABELS.map((l, i) => (
          <button
            key={l}
            className={"grade" + (i === suggestedIdx ? " suggest" : "")}
            data-g={i}
            onClick={() => review.grade((i + 1) as 1 | 2 | 3 | 4)}
            title={`Grade ${l} (${i + 1})`}
          >
            <span className="lbl">
              {l}
              <kbd className="grade-key">{i + 1}</kbd>
            </span>
            <span className="ivl">{fmt(pv[i])}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
