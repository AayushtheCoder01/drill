/* ============================================================================
 * MemorySaved — what a "remember this" actually did, shown under the reply.
 *
 * The memory tray is unreachable from chat: <Sheet> is mounted only in the
 * review and cards views, and the sidebar has no memory entry. Rather than
 * mounting the sheet everywhere, the result of a save is shown where it
 * happened, and can be actioned there.
 *
 * Queued items read their live state back from services/candidates rather
 * than trusting the copy stored on the turn — accepting one in the tray must
 * not leave this block claiming it is still waiting.
 * ========================================================================== */
import * as candidates from "@/services/candidates";
import { useStoreSync } from "@/hooks/useStoreSync";
import type { SavedMemory } from "@/types/chat";

export default function MemorySaved({ saved }: { saved: SavedMemory }) {
  useStoreSync(candidates);

  const open = candidates.all();
  const stillWaiting = saved.queued.filter((q) => open.some((p) => p.id === q.id));
  const actioned = saved.queued.length - stillWaiting.length;

  const nothing = !saved.committed.length && !saved.queued.length && !saved.skipped.length;
  if (nothing) return null;

  return (
    <div className="msave">
      <div className="msave-head">Memory</div>

      {saved.committed.map((m) => (
        <div key={m.id} className="msave-row">
          <span className="msave-mark on">+</span>
          <span className="msave-text">{m.text}</span>
          <span className="msave-type">{m.type}</span>
        </div>
      ))}

      {stillWaiting.map((m) => (
        <div key={m.id} className="msave-row">
          <span className="msave-mark">?</span>
          <span className="msave-text">
            {m.text}
            {m.supersedes && <em className="msave-note"> replaces an earlier note</em>}
          </span>
          <span className="msave-acts">
            <button className="tact" onClick={() => candidates.accept(m.id)}>
              Keep
            </button>
            <button className="tact" onClick={() => candidates.reject(m.id)}>
              Discard
            </button>
          </span>
        </div>
      ))}

      {saved.skipped.map((s, i) => (
        <div key={i} className="msave-row muted">
          <span className="msave-mark">=</span>
          <span className="msave-text">
            Already knew this — {s.existingText}
          </span>
        </div>
      ))}

      {actioned > 0 && (
        <div className="msave-foot">
          {actioned} {actioned === 1 ? "item" : "items"} already dealt with.
        </div>
      )}

      {saved.atCap && (
        <div className="msave-foot warn">
          Global memory is at its cap. Consolidate it so new facts have room — Memory panel → Consolidate.
        </div>
      )}
    </div>
  );
}
