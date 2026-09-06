/* ============================================================================
 * TextRow — a text or number setting that saves itself.
 *
 * Settings used to be committed two different ways on the same screen. The
 * switches and segmented controls wrote through immediately; the seven text
 * fields — key, base URL, model, cards per day, longest interval, tutor
 * prompt — were drafts held in component state until you found the Save
 * button at the bottom. Nothing said which was which, so editing a number and
 * closing the panel silently threw it away, and it looked exactly like the
 * ones that had just worked.
 *
 * One rule now: everything commits. A field commits when it loses focus or
 * when you press Enter, which is what a form in a settings panel is expected
 * to do, and there is no Save button left to not press.
 *
 * The draft still exists — you cannot write through on every keystroke, or
 * clearing a number field to retype it would commit the empty string and the
 * store would clamp it to a default under your hands. It just has a much
 * shorter life.
 * ========================================================================== */
import { useEffect, useState } from "react";
import SettingRow from "./SettingRow";

export default function TextRow({
  title,
  sub,
  origin,
  value,
  placeholder,
  type,
  mono,
  multiline,
  onCommit
}: {
  title: string;
  sub?: string;
  origin?: string;
  value: string;
  placeholder?: string;
  type?: "text" | "number";
  mono?: boolean;
  multiline?: boolean;
  /** Called on blur and on Enter, never per keystroke. */
  onCommit: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  /* Re-seed when the stored value changes underneath — switching backend
     hands back a different key and model, and the field has to follow. */
  useEffect(() => setDraft(value), [value]);

  function commit() {
    if (draft !== value) onCommit(draft);
  }

  const cls = "fi" + (mono ? " mono" : "");

  return (
    <SettingRow title={title} sub={sub} origin={origin}>
      {multiline ? (
        <textarea
          className={cls}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
        />
      ) : (
        <input
          className={cls}
          type={type || "text"}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
      )}
    </SettingRow>
  );
}
