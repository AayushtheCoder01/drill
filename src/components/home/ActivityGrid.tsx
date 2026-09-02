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
  const cols = grid(log, weeks);
  const months = monthLabels(cols);
  const total = log.length;
  const track = { gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` };

  return (
    <div className="act">
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
              title={title(c)}
            />
          ))
        )}
      </div>

      <div className="act-legend">
        <span>{total.toLocaleString()} reviews in the last year</span>
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
