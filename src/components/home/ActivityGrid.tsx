/* ============================================================================
 * ActivityGrid — a year of days, one square each.
 *
 * The review queue never ends and never fills up, so there is no natural
 * picture of "how much have I actually done". This is that picture: the same
 * calendar-of-squares GitHub uses, because it answers the only two questions
 * worth asking of a habit — did I show up, and for how long in a row.
 *
 * It never scrolls. The columns are fractions of whatever width the page has,
 * so a year always fits: the squares get smaller on a narrow window, and a
 * scrollbar never appears under the calendar to be dragged.
 * ========================================================================== */
import { useEffect, useState } from "react";
import { grid, monthLabels, type DayCell } from "@/lib/activity";
import type { LogEntry } from "@/types";

function title(c: DayCell): string {
  const when = new Date(c.ts).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric"
  });
  if (c.future) return when;
  return `${c.count} review${c.count === 1 ? "" : "s"} · ${when}`;
}

export default function ActivityGrid({ log, weeks = 53 }: { log: LogEntry[]; weeks?: number }) {
  /* One readout, not two. The cells used to carry a `title` as well, so the
     browser drew its own tooltip on top of this one a second later - the same
     sentence twice, in two different type styles. */
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);

  /* The tip is positioned in viewport coordinates, measured once on enter, so
     anything that moves the grid underneath would leave it behind. Nothing
     re-measures on scroll: at this size the honest thing is to drop it. */
  useEffect(() => {
    if (!tip) return;
    const drop = () => setTip(null);
    window.addEventListener("scroll", drop, { passive: true, capture: true });
    window.addEventListener("resize", drop, { passive: true });
    return () => {
      window.removeEventListener("scroll", drop, { capture: true });
      window.removeEventListener("resize", drop);
    };
  }, [tip]);

  const cols = grid(log, weeks);
  const months = monthLabels(cols);
  /* Summed from the squares actually drawn, not `log.length`. The legend says
     "in the last year" and the log goes back further than the grid does, so
     reading the whole log put a number under the calendar that the calendar
     did not contain. */
  const total = cols.reduce((n, col) => n + col.reduce((m, c) => m + c.count, 0), 0);
  const track = { gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` };

  return (
    <div className="act" onMouseLeave={() => setTip(null)}>
      <div className="act-months" style={track}>
        {months.map((m) => (
          <span key={m.col} className="act-month" style={{ gridColumnStart: m.col + 1 }}>
            {m.label}
          </span>
        ))}
      </div>

      {/* One flat grid rather than a div per week: the browser lays out 371
          squares in a single pass, and the month row above can address a
          column by number. */}
      <div className="act-grid" style={track} role="img" aria-label={`${total} reviews over the last ${weeks} weeks`}>
        {cols.map((col, ci) =>
          col.map((c, ri) => (
            <i
              key={c.key}
              className={"act-cell" + (c.future ? " future" : "")}
              data-level={c.future ? undefined : c.level}
              style={{ gridColumn: ci + 1, gridRow: ri + 1 }}
              onMouseEnter={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setTip({ x: rect.left + rect.width / 2, y: rect.top - 8, text: title(c) });
              }}
            />
          ))
        )}
      </div>

      {tip && (
        <div className="act-tip" style={{ left: tip.x, top: tip.y }} role="status">
          {tip.text}
        </div>
      )}

      <div className="act-legend">
        <span>
          {total.toLocaleString()} review{total === 1 ? "" : "s"} in the last year
          {log.length > total ? ` · ${(log.length - total).toLocaleString()} older` : ""}
        </span>
        <span className="act-key">
          Less
          {[0, 1, 2, 3, 4].map((l) => (
            <i key={l} className="act-cell act-key-cell" data-level={l} />
          ))}
          More
        </span>
      </div>
    </div>
  );
}
