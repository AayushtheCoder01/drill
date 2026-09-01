import { ACCENT_ORDER, ACCENTS, accentSwatch } from "@/lib/theme";
import type { Accent, Theme } from "@/types";

/** Swatches are drawn in the accent's colour *for the current printing*, not
 *  its night one: the day accents are several steps darker, and showing the
 *  night value on paper would promise an ink the app is not going to use. */
export default function AccentPicker({
  value,
  theme,
  onChange
}: {
  value: Accent;
  theme: Theme;
  onChange: (a: Accent) => void;
}) {
  return (
    <div className="accentrow">
      {ACCENT_ORDER.map((id) => {
        const color = accentSwatch(id, theme);
        return (
          <button
            key={id}
            className={"swatch" + (id === value ? " on" : "")}
            style={{ background: color, color }}
            aria-label={ACCENTS[id].label}
            aria-pressed={id === value}
            title={ACCENTS[id].label}
            onClick={() => onChange(id)}
          >
            {id === value && (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M5 13l4 4L19 7"
                  stroke="var(--on-accent)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
        );
      })}
    </div>
  );
}
