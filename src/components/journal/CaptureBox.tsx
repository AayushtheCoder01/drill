/* ============================================================================
 * CaptureBox — the lowest-friction thing in the app.
 *
 * Never calls the API: saves instantly, works offline, and appends rather
 * than replaces, so logging twice in a day just adds to that day's entry.
 * That last rule matters more than it looks — see START-HERE.md §4 Stage 1.
 * ========================================================================== */
import { useRef, useState } from "react";
import * as journalStore from "@/services/journalStore";
import { useToast } from "@/context/ToastContext";
import { ago } from "@/lib/util";
import type { JournalEntry } from "@/types/journal";

const ACCEPT = /\.(md|txt)$/i;

export default function CaptureBox({ entry }: { entry: JournalEntry }) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  function save() {
    const t = text.trim();
    if (!t) return;
    journalStore.appendRaw(entry, "typed", "", t);
    setText("");
    toast("Added to today's log");
  }

  function readFile(f: File) {
    if (!ACCEPT.test(f.name)) {
      toast("Only .md or .txt files");
      return;
    }
    const rd = new FileReader();
    rd.onload = () => {
      journalStore.appendRaw(entry, "file", f.name, String(rd.result));
      toast("Added " + f.name + " to today's log");
    };
    rd.readAsText(f);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) readFile(f);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) readFile(f);
  }

  return (
    <div
      className={"jrnl-capture" + (dragOver ? " jrnl-drop" : "")}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <label className="f">What did you do today?</label>
      <textarea
        className="fi"
        style={{ minHeight: 100 }}
        placeholder="what you did, what you read, what confused you, links, anything — drop a .md/.txt file too"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") save();
        }}
      />
      <div className="btnrow">
        <button className="btn pri" onClick={save}>
          Add to today's log
        </button>
        <button className="btn sm" onClick={() => fileRef.current?.click()}>
          Attach a file…
        </button>
      </div>
      <input ref={fileRef} type="file" accept=".md,.txt,text/plain,text/markdown" style={{ display: "none" }} onChange={onFile} />

      {entry.raw.length > 0 && (
        <div className="jrnl-rawlist">
          {entry.raw
            .slice()
            .reverse()
            .map((r) => (
              <div key={r.id} className="jrnl-rawitem">
                <span className="tagmini">
                  {r.via}
                  {r.label ? ` · ${r.label}` : ""} · {ago(r.at)}
                </span>
                <div className="jrnl-rawtext">{r.text.length > 320 ? r.text.slice(0, 320) + "…" : r.text}</div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
