/* ============================================================================
 * Working — what the app shows while a model is thinking.
 *
 * Every wait used to be one grey dot pulsing next to a fixed word, which tells
 * you nothing except that the app has not crashed. A model call here takes ten
 * to forty seconds; that is long enough that the wait is part of the product,
 * so it is worth setting properly.
 *
 * Three things, and no more than three:
 *   · a compositor's stick — six slugs filling left to right, over and over,
 *     which is a progress *rhythm* rather than a fake progress bar
 *   · the actual stages, in order, advancing on a timer, so a long wait reads
 *     as work rather than as a hang
 *   · the elapsed seconds, once it has been long enough to wonder
 *
 * Give it the real stages of the job. They are not decoration: "looking for
 * what is durable" is a truthful description of what distil is doing, and a
 * truthful one is more reassuring than a spinner.
 * ========================================================================== */
import { useEffect, useState } from "react";

/** How long each stage holds before the next one takes over. */
const STAGE_MS = 4200;
/** Elapsed time appears only once the wait is worth acknowledging. */
const CLOCK_AFTER_MS = 5000;

export default function Working({ stages, note }: { stages: string[]; note?: string }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, []);

  const elapsed = tick * 500;
  // The last stage holds rather than looping: a list that starts over reads as
  // "it gave up and is trying again", which is exactly the wrong impression.
  const stage = stages[Math.min(stages.length - 1, Math.floor(elapsed / STAGE_MS))] || "working";
  const seconds = Math.floor(elapsed / 1000);

  return (
    <div className="working" role="status" aria-live="polite">
      <div className="working-stick" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <i key={i} style={{ animationDelay: i * 0.12 + "s" }} />
        ))}
      </div>
      <div className="working-txt">
        <span className="working-stage">{stage}</span>
        {elapsed >= CLOCK_AFTER_MS && <span className="working-clock">{seconds}s</span>}
      </div>
      {note && <div className="working-note">{note}</div>}
    </div>
  );
}
