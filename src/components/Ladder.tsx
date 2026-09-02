/* ============================================================================
 * Ladder — one quiet line about the card in front of you.
 *
 * This used to be a log-scaled rule with six stops and four ghost markers.
 * It was pretty and nobody read it: the grade bar already prints what each
 * answer costs you ("Good · 3d"), so the rule was saying the same thing a
 * second time in a notation you had to learn first.
 *
 * What is left is the part the grade bar cannot say — where this card stands
 * *before* you answer: its current interval, how often you have seen it, and
 * how often it has fallen over. One line, plain words, no legend.
 * ========================================================================== */
import * as store from "@/services/store";
import { useReview } from "@/context/ReviewContext";
import { fmt } from "@/lib/util";

export default function Ladder() {
  const { current } = useReview();

  if (!current) return <div className="ladder" hidden></div>;

  const st = current.st;
  const seen = st.reps || 0;
  const lapses = st.lapses || 0;
  const ivl = store.currentInterval(st);

  const facts: string[] = [];
  facts.push(seen === 0 ? "New card" : `On a ${fmt(ivl)} interval`);
  if (seen > 0) facts.push(`seen ${seen}×`);
  if (lapses > 0) facts.push(`forgotten ${lapses}×`);
  if (seen > 0 && store.isLeech(st)) facts.push("leech");

  return (
    <div className="ladder">
      <span className="ladder-line">{facts.join(" · ")}</span>
    </div>
  );
}
