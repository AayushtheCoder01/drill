/* ============================================================================
 * ActionChips — the per-conversation capability toggles in the composer.
 *
 * One chip per entry in lib/chatActions.ts. A chip whose action the current
 * backend cannot perform is disabled and says why, rather than being hidden:
 * "why can't I search the web" should be answerable by looking at the thing
 * itself, and a toggle that silently does nothing is the dead-dial problem.
 *
 * Adding a second action needs no change here — it appears from the registry.
 * ========================================================================== */
import * as AI from "@/services/ai";
import { ACTION_ORDER, CHAT_ACTIONS, supportedBy, type ChatActionId } from "@/lib/chatActions";
import type { BackendType } from "@/types";

export default function ActionChips({
  active,
  backend,
  model,
  onChange
}: {
  active: ChatActionId[];
  /** The conversation's own backend, so the chips track a per-thread override
   *  rather than the global default. "" means inherit, which resolve() then
   *  works out the same way the send path does. */
  backend?: BackendType | "";
  model?: string;
  onChange: (next: ChatActionId[]) => void;
}) {
  const supports = AI.resolve({ backend, model }).backend.supports;

  return (
    <>
      {ACTION_ORDER.map((id) => {
        const action = CHAT_ACTIONS[id];
        const can = supportedBy(supports, id);
        const on = active.includes(id);
        return (
          <button
            key={id}
            type="button"
            className={"cbtn actchip" + (on && can ? " on" : "")}
            disabled={!can}
            aria-pressed={on && can}
            title={can ? action.blurb : action.unsupported}
            onClick={() => onChange(on ? active.filter((a) => a !== id) : [...active, id])}
          >
            {action.label}
          </button>
        );
      })}
    </>
  );
}
