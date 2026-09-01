/* ============================================================================
 * RollupDiff — the approval step for a weekly rollup or a stand-alone memory
 * consolidation. Shared between both because the shape is identical: a list
 * of add/merge/retire lines, each individually editable and rejectable, that
 * commits straight to memory once approved — this view *is* the review, so
 * approved lines do not go through the candidate tray a second time.
 * ========================================================================== */
import { useState } from "react";
import * as memoryStore from "@/services/memoryStore";
import { useToast } from "@/context/ToastContext";
import type { MemoryDiffLine } from "@/types/journal";
import type { Memory } from "@/types";
import Icon from "../ui/Icon";

export default function RollupDiff({
  title,
  sub,
  diff,
  projectId,
  onClose,
  onCommitted
}: {
  title: string;
  sub?: string;
  diff: MemoryDiffLine[];
  projectId: string;
  onClose: () => void;
  onCommitted?: () => void;
}) {
  const toast = useToast();
  const [on, setOn] = useState<boolean[]>(() => diff.map(() => true));

  /* Say up front which lines cannot apply, so a line that will quietly do
     nothing is visible before it is approved rather than after. */
  function labelFor(line: MemoryDiffLine): { badge: string; text: string; warn?: string } {
    if (line.kind === "add") return { badge: "+ new", text: `(${line.type}) ${line.text}` };

    if (line.kind === "merge") {
      const found = line.from.map((id) => memoryStore.get(id));
      const names = found.map((m, i) => m?.text.slice(0, 44) || line.from[i]).join("  +  ");
      const missing = found.filter((m) => !m).length;
      const pinned = found.some((m) => m?.pinned);
      return {
        badge: "~ merge",
        text: `${names}\n→ ${line.text}`,
        warn: pinned
          ? "one of these is pinned — it will be left alone"
          : missing === found.length
            ? "none of these memories exist; this line will do nothing"
            : missing
              ? `${missing} of these memories do not exist and will be ignored`
              : undefined
      };
    }

    const m = memoryStore.get(line.id);
    return {
      badge: "− retire",
      text: (m ? m.text : line.id) + (line.reason ? ` — ${line.reason}` : ""),
      warn: !m ? "no memory with this id; this line will do nothing" : m.pinned ? "pinned — it will be left alone" : undefined
    };
  }

  /* Count what actually happened, not what was approved. A model that invents
     a memory id produces a diff line that retires nothing — retire() returns
     "unknown-id" and no-ops — and this used to report it as a success anyway.
     Pinned memories are refused outright by the store, so they surface here as
     skipped rather than vanishing. */
  function commit() {
    let added = 0,
      merged = 0,
      retired = 0;
    const skipped: string[] = [];

    diff.forEach((line, i) => {
      if (!on[i]) return;

      if (line.kind === "add") {
        memoryStore.create({ scope: "project", projectId, type: line.type, text: line.text, source: "consolidated" });
        added++;
        return;
      }

      if (line.kind === "merge") {
        // Only merge sources that actually exist; a merge whose inputs are all
        // hallucinated would otherwise create a duplicate and retire nothing.
        const sources = line.from.map((id) => memoryStore.get(id)).filter((m): m is Memory => !!m);
        if (!sources.length) {
          skipped.push("a merge naming memories that do not exist");
          return;
        }
        if (sources.some((m) => m.pinned)) {
          skipped.push("a merge over a pinned memory");
          return;
        }
        const m = memoryStore.create({
          scope: "project",
          projectId,
          type: sources[0].type,
          text: line.text,
          source: "consolidated"
        });
        for (const src of sources) memoryStore.retire(src.id, m.id);
        merged++;
        return;
      }

      const result = memoryStore.retire(line.id, null);
      if (result === "retired") retired++;
      else if (result === "pinned") skipped.push("a pinned memory");
      else if (result === "unknown-id") skipped.push("a memory that does not exist");
    });

    const summary = `+${added} new · ~${merged} merged · −${retired} retired`;
    toast(skipped.length ? `${summary} · ${skipped.length} skipped (${skipped[0]})` : summary, skipped.length ? 6000 : undefined);
    onCommitted?.();
    onClose();
  }

  const chosen = on.filter(Boolean).length;

  return (
    <div
      className="sheet"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet-inner">
        <div className="sheet-head">
          <h3>{title}</h3>
          <span className="sub">{sub || ""}</span>
          <button className="iconbtn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="sheet-body">
          {diff.length === 0 ? (
            <div className="empty">Nothing to change — memory is already in good shape.</div>
          ) : (
            <>
              {diff.map((line, i) => {
                const { badge, text, warn } = labelFor(line);
                return (
                  <div key={i} className={"prop" + (on[i] ? "" : " off")}>
                    <div className="ph">
                      <button
                        className={"toggle" + (on[i] ? " on" : "")}
                        onClick={() => setOn((prev) => prev.map((v, j) => (j === i ? !v : v)))}
                      >
                        {on[i] ? "✓" : ""}
                      </button>
                      <div className="grow">
                        <span className="tagmini">{badge}</span>
                        <div className="qmini" style={{ whiteSpace: "pre-wrap" }}>
                          {text}
                        </div>
                        {warn && <div className="hintline">{warn}</div>}
                      </div>
                    </div>
                  </div>
                );
              })}
              <button className="btn pri" onClick={commit} disabled={!chosen}>
                Apply {chosen} change{chosen === 1 ? "" : "s"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
