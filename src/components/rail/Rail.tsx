/* ============================================================================
 * Rail — the parts every instrument panel is built from.
 *
 * Four sections have a right-hand rail and they must read as one instrument,
 * not four widgets stacked in a column. That only holds if they compose the
 * same handful of pieces, so this file is the whole vocabulary: a titled
 * group, a figure, a bar, a list, and a week of dots.
 *
 * Nothing here reads the store. Each section's rail assembles these from its
 * own data, which keeps this file free of any one section's idea of what
 * matters.
 * ========================================================================== */
import type { ReactNode } from "react";

export function RailGroup({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="rail-group">
      <h4 className="rail-title">
        <span>{title}</span>
        {note && <span className="rail-title-note">{note}</span>}
      </h4>
      {children}
    </section>
  );
}

/** A single number, set in the reading face. `unit` is the small caps word
 *  after it — "days", "cards" — not a symbol crammed into `value`. */
export function RailFigure({ value, unit, muted }: { value: ReactNode; unit?: string; muted?: boolean }) {
  return (
    <div className={"rail-figure" + (muted ? " muted" : "")}>
      <span>{value}</span>
      {unit && <span className="rail-unit">{unit}</span>}
    </div>
  );
}

/** Progress toward a target. Turns green on arrival rather than announcing it,
 *  because finishing a session should feel like a thing that happened, not a
 *  thing the app congratulates you for. */
export function RailBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      className={"rail-bar" + (max > 0 && value >= max ? " done" : "")}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <i style={{ width: pct + "%" }} />
    </div>
  );
}

export function RailSub({ children }: { children: ReactNode }) {
  return <div className="rail-sub">{children}</div>;
}

export function RailList({ children }: { children: ReactNode }) {
  return <ul className="rail-list">{children}</ul>;
}

/** One line in a list. Give it `onClick` and it becomes a button — the mark
 *  and the truncation behave identically either way. */
export function RailItem({ mark, text, title, onClick }: { mark?: string; text: string; title?: string; onClick?: () => void }) {
  const inner = (
    <>
      {mark && <span className="rail-item-mark">{mark}</span>}
      <span className="rail-item-text">{text}</span>
    </>
  );
  return (
    <li>
      {onClick ? (
        <button className="rail-item" onClick={onClick} title={title || text}>
          {inner}
        </button>
      ) : (
        <div className="rail-item" title={title || text}>
          {inner}
        </div>
      )}
    </li>
  );
}

/** Seven dots, oldest first, `today` marked. `days` is a boolean per day. */
export function RailWeek({ days }: { days: boolean[] }) {
  return (
    <div className="rail-week" aria-hidden="true">
      {days.map((on, i) => (
        <i key={i} className={(on ? "on" : "") + (i === days.length - 1 ? " today" : "")} />
      ))}
    </div>
  );
}

export function RailEmpty({ children }: { children: ReactNode }) {
  return <div className="rail-empty">{children}</div>;
}
