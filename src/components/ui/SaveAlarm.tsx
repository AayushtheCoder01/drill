/* ============================================================================
 * SaveAlarm — the one thing in this app that is allowed to shout.
 *
 * Drill keeps everything in one browser. When a write fails there is no
 * server holding a copy, no sync that will catch up later, and no second
 * device — the work is in memory, it looks completely fine on screen, and it
 * is gone the moment the tab closes. That was the actual failure: localStorage
 * gives an origin about 5MB, the review log grew inside it, `setItem` started
 * throwing, and the save path logged to a console nobody had open and carried
 * on. Hours disappeared on reload with no warning before and no explanation
 * after.
 *
 * So: rendered by Shell, above every section, in a colour that means stop, and
 * it does not go away on a timer. A toast was the wrong shape for this — a
 * toast is for "done", and this is a condition, not an event.
 *
 * Three states, in descending severity:
 *   failing  nothing is being written at all. Take a backup right now.
 *   tight    the last save only fit because weight was shed. Still working,
 *            but the next one may not, and something was already given up.
 *   quiet    render nothing.
 *
 * It watches both halves of persistence. store.getSaveState() is the review
 * database in localStorage; persistence.latest() is every IndexedDB write —
 * conversations, journal, memory, exams — which had the identical bug in five
 * more places and no reporting at all.
 * ========================================================================== */
import { useState } from "react";
import * as store from "@/services/store";
import * as backup from "@/services/backup";
import * as persistence from "@/services/persistence";
import { useDrillStore } from "@/hooks/useDrillStore";
import { useStoreSync } from "@/hooks/useStoreSync";
import { useSettings } from "@/context/SettingsContext";
import Icon from "./Icon";

function when(ts: number): string {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function SaveAlarm() {
  /* Subscribed to the store rather than polling: saveNow() notifies on every
     transition of this state and on nothing else, so this re-renders when the
     answer changes and never in between. */
  useDrillStore();
  useStoreSync(persistence);
  const settings = useSettings();
  const s = store.getSaveState();
  const idb = persistence.latest();
  const twoTabs = store.otherTabWriting();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  if (s.ok && !s.tight && !s.dropped && !idb && !twoTabs) return null;

  const failing = !s.ok || !!idb || twoTabs;

  function download() {
    setBusy(true);
    backup
      .downloadEverything()
      .then(() => setSaved(true))
      .catch((e: Error) => console.error("Backup failed", e))
      .finally(() => setBusy(false));
  }

  return (
    <div className={"savealarm" + (failing ? " bad" : "")} role="alert">
      <Icon name={failing ? "help" : "archive"} size={16} className="savealarm-mark" />

      <div className="savealarm-txt">
        <strong>
          {twoTabs
            ? "Drill is open in another tab."
            : failing
              ? "Drill cannot save to this browser."
              : "This browser is nearly out of room for Drill."}
        </strong>
        <span>
          {twoTabs ? (
            <>
              Both tabs hold their own copy of everything and each one saves all of it, so whichever you close
              last wins and the other tab's work is thrown away. Close the others, then reload this tab to pick up
              what they did. Nothing is lost yet.
            </>
          ) : !s.ok ? (
            <>
              {s.reason === "quota"
                ? "Storage is full, and there was nothing left to shed. "
                : s.reason === "blocked"
                  ? "This browser is refusing to store site data — a private window, or storage turned off for this site. "
                  : "The write was refused. "}
              Nothing has been written down since {when(s.at)}, and it will be lost when this tab closes. Download a
              backup now, then free some space or move to another browser.
            </>
          ) : idb ? (
            <>
              {idb.count === 1
                ? `The last ${idb.area} could not be saved`
                : `${idb.count.toLocaleString()} writes have failed, most recently a ${idb.area}`}{" "}
              ({idb.message}). Chats, the journal, memory and exams are all kept this way, so anything you have
              added since {when(idb.at)} exists only on this screen. Download a backup and reload.
            </>
          ) : (
            <>
              The last save only fit after dropping the recall notes from older reviews
              {s.dropped > 0
                ? ` and forgetting the oldest ${s.dropped.toLocaleString()} of them`
                : ""}
              . Grades, dates and your streak are intact. Take a backup while it is still working.
            </>
          )}
        </span>
      </div>

      <div className="savealarm-acts">
        {twoTabs ? (
          <button className="btn sm pri" onClick={() => window.location.reload()}>
            Reload this tab
          </button>
        ) : (
          <button className="btn sm pri" disabled={busy} onClick={download}>
            {busy ? "Saving…" : saved ? "Saved ✓" : "Download a backup"}
          </button>
        )}
        <button className="btn sm" onClick={() => settings.open("data", "data.storage")}>
          What to do
        </button>
        {/* Only the survivable state can be dismissed. A failing save has no
            "I have read this" — it is still failing, and hiding it is how the
            next hour goes the same way as the last one. */}
        {!failing && (
          <button className="iconbtn" onClick={() => store.acknowledgeSaveState()} aria-label="Dismiss">
            <Icon name="close" size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
