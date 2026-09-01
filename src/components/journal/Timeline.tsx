/* ============================================================================
 * Timeline — entries by day, filterable by the lib/when.ts phrase parser, so
 * "last week" finds them without a single API call.
 * ========================================================================== */
import { useState } from "react";
import * as journalStore from "@/services/journalStore";
import { dayInRange, parseWhen } from "@/lib/when";

export default function Timeline({
  projectId,
  activeDay,
  onPick
}: {
  projectId: string;
  activeDay: string;
  onPick: (day: string) => void;
}) {
  const [q, setQ] = useState("");
  const entries = journalStore.listForProject(projectId);
  const range = q.trim() ? parseWhen(q) : null;
  const filtered = range ? entries.filter((e) => dayInRange(e.day, range)) : entries;

  return (
    <div className="jrnl-timeline">
      <input className="fi mono" placeholder='filter — "last week", "march", "3 days ago"…' value={q} onChange={(e) => setQ(e.target.value)} />
      {q.trim() && !range && <div className="hintline">Could not parse that — showing every entry below.</div>}
      {range && (
        <div className="hintline">
          {filtered.length} entr{filtered.length === 1 ? "y" : "ies"} · {range.label}
        </div>
      )}
      <div className="list">
        {filtered.map((e) => (
          <button key={e.id} className={"item" + (e.day === activeDay ? " on" : "")} onClick={() => onPick(e.day)}>
            <span className="grow">
              <span className="t">{e.day}</span>
              <span className="s">
                {e.summary ? e.summary.narrative.slice(0, 90) : `${e.raw.length} raw entr${e.raw.length === 1 ? "y" : "ies"}, not written yet`}
              </span>
            </span>
          </button>
        ))}
        {!filtered.length && <div className="empty">Nothing here yet.</div>}
      </div>
    </div>
  );
}
