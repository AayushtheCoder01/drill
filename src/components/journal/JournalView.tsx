/* ============================================================================
 * JournalView — the top-level journal page: capture, narrative, distill,
 * timeline and the weekly rollup, all scoped to the active project.
 * ========================================================================== */
import { useEffect, useState } from "react";
import * as store from "@/services/store";
import * as journalStore from "@/services/journalStore";
import * as memoryStore from "@/services/memoryStore";
import * as AI from "@/services/ai";
import { useDrillStore } from "@/hooks/useDrillStore";
import { useStoreSync } from "@/hooks/useStoreSync";
import { useRoute } from "@/context/RouteContext";
import { useToast } from "@/context/ToastContext";
import { today } from "@/lib/util";
import { parseDayKey } from "@/lib/when";
import Shell from "../Shell";
import JournalRail from "../rail/JournalRail";
import CaptureBox from "./CaptureBox";
import JournalEntryView from "./JournalEntryView";
import Timeline from "./Timeline";
import DistillReview from "./DistillReview";
import RollupDiff from "./RollupDiff";
import type { MemoryDiffLine } from "@/types/journal";
import "@/styles/views.css";

export default function JournalView() {
  useDrillStore();
  useStoreSync(journalStore);
  const { projectId, journalDay, openJournal } = useRoute();
  const toast = useToast();

  const [showTimeline, setShowTimeline] = useState(false);
  const [distilling, setDistilling] = useState(false);
  const [rollupBusy, setRollupBusy] = useState(false);
  const [rollupDiff, setRollupDiff] = useState<MemoryDiffLine[] | null>(null);

  useEffect(() => {
    void journalStore.init();
  }, []);

  const project = store.get().projects[projectId];
  const day = journalDay || today();
  const isToday = day === today();

  // Creating today's entry is a store mutation, so it belongs in an effect,
  // not directly in render. Gated on isLoaded(): getOrCreateToday reads the
  // in-memory cache, and running it before IndexedDB has finished loading
  // would find nothing, create a duplicate, then have that duplicate
  // clobbered when the real load lands — isLoaded flips true on the
  // notify() that load triggers, which useStoreSync above turns into a
  // re-render, which is what lets this effect's dependency actually change.
  const journalLoaded = journalStore.isLoaded();
  useEffect(() => {
    if (isToday && journalLoaded) journalStore.getOrCreateToday(projectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, isToday, journalLoaded]);

  const entry = journalStore.byDay(projectId, day);
  const unrolled = journalStore.unrolledEntries(projectId);
  const rollups = journalStore.listRollups(projectId);

  function runRollup() {
    if (!unrolled.length) {
      toast("Nothing new to roll up");
      return;
    }
    setRollupBusy(true);
    const existingMem = memoryStore.list({ scope: "project", projectId, activeOnly: true });
    AI.rollup(unrolled, project, existingMem)
      .then((r) => {
        journalStore.createRollup({
          projectId,
          from: Math.min(...unrolled.map((e) => e.created)),
          to: Math.max(...unrolled.map((e) => e.updated)),
          label: `${unrolled.length} ${unrolled.length === 1 ? "entry" : "entries"}`,
          entryIds: unrolled.map((e) => e.id),
          narrative: r.narrative,
          themes: r.themes,
          stillOpen: r.stillOpen
        });
        setRollupDiff(r.diff);
        toast("Rollup written");
      })
      .catch((e: Error) => toast(e.message, 5000))
      .finally(() => setRollupBusy(false));
  }

  if (!project) return null;

  return (
    <Shell
      current="journal"
      aside={<JournalRail projectId={projectId} onOpenDay={(d) => openJournal(d === today() ? null : d)} />}
    >
      <div className="app-scroll">
        <div className="page">
          <div className="page-eyebrow">
            {parseDayKey(day).toLocaleDateString(undefined, {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric"
            })}
          </div>
          <div className="jrnl-head">
            <h2>{isToday ? "Today" : day}</h2>
            <div className="btnrow" style={{ margin: 0 }}>
              <button className="btn sm" onClick={() => setShowTimeline((v) => !v)}>
                {showTimeline ? "Hide history" : unrolled.length ? `History · ${unrolled.length} new` : "History"}
              </button>
              {!isToday && (
                <button className="btn sm" onClick={() => openJournal(null)}>
                  Today
                </button>
              )}
            </div>
          </div>

          {showTimeline && (
            <>
              <Timeline
                projectId={projectId}
                activeDay={day}
                onPick={(picked) => {
                  openJournal(picked === today() ? null : picked);
                  setShowTimeline(false);
                }}
              />
              <div className="btnrow" style={{ marginBottom: 22 }}>
                <button className="btn sm" disabled={rollupBusy || !unrolled.length} onClick={runRollup}>
                  {rollupBusy ? "Writing rollup…" : `Weekly rollup (${unrolled.length} new)`}
                </button>
              </div>
              {rollups.length > 0 && (
                <div className="jrnl-timeline">
                  <label className="f">Past rollups</label>
                  {rollups.map((r) => (
                    <div key={r.id} className="logent">
                      <div className="lt">
                        <span>{r.label}</span>
                        <span>{new Date(r.created).toLocaleDateString()}</span>
                      </div>
                      <div className="lb">{r.narrative}</div>
                      {r.stillOpen.length > 0 && (
                        <div className="hintline" style={{ margin: "8px 0 0" }}>
                          Still open: {r.stillOpen.join("; ")}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {!entry ? (
            <div className="empty">No entry for {day}.</div>
          ) : (
            <>
              {isToday && <CaptureBox entry={entry} key={entry.id} />}
              <JournalEntryView entry={entry} project={project} onDistill={() => setDistilling(true)} />
            </>
          )}
        </div>
      </div>

      {distilling && entry && <DistillReview key={entry.id} entry={entry} project={project} onClose={() => setDistilling(false)} />}
      {rollupDiff && (
        <RollupDiff title="Weekly rollup" sub="review before it changes memory" diff={rollupDiff} projectId={projectId} onClose={() => setRollupDiff(null)} />
      )}
    </Shell>
  );
}
