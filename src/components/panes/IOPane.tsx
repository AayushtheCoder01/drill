import { useEffect, useRef, useState } from "react";
import * as store from "@/services/store";
import * as backup from "@/services/backup";
import * as storage from "@/services/storage";
import * as U from "@/lib/util";
import { useSheet } from "@/context/SheetContext";
import { useReview } from "@/context/ReviewContext";
import { useToast } from "@/context/ToastContext";
import SheetShell from "../SheetShell";
import Item from "../ui/Item";
import type { BackupSummary, FullBackup, ImportPayload } from "@/types";

function fmtBytes(n: number | null): string {
  if (n == null) return "unknown";
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + " KB";
  return (n / 1024 / 1024).toFixed(1) + " MB";
}

/** One line per thing the backup holds, skipping what it has none of. */
function describe(s: BackupSummary): string {
  const bits = [
    s.projects + " project" + (s.projects === 1 ? "" : "s"),
    s.decks + " deck" + (s.decks === 1 ? "" : "s"),
    s.cards + " cards",
    s.conversations + " conversation" + (s.conversations === 1 ? "" : "s"),
    s.notes + " note" + (s.notes === 1 ? "" : "s")
  ];
  if (s.memories) bits.push(s.memories + " memories");
  return bits.join(" · ");
}

export default function IOPane() {
  const { open, close } = useSheet();
  const review = useReview();
  const toast = useToast();
  const db = store.get();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const backupInput = useRef<HTMLInputElement | null>(null);

  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ kind: "note" | "err" | "ok"; text: string } | null>(null);
  const [health, setHealth] = useState<storage.StorageHealth | null>(null);
  /* A parsed backup waiting on confirmation, with what it would replace. */
  const [pending, setPending] = useState<{ file: FullBackup; incoming: BackupSummary; current: BackupSummary } | null>(
    null
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void storage.storageHealth().then(setHealth);
  }, []);

  /** `source` lets a caller validate text it has in hand. Reading `text` from
   *  state would see the previous render's value — which is why loading a
   *  file used to report "Nothing pasted yet". */
  function check(source?: string): ImportPayload | null {
    const raw = (source ?? text).trim();
    if (!raw) {
      setMsg({ kind: "note", text: "Nothing pasted yet." });
      return null;
    }
    try {
      const p = store.readPayload(raw);
      if (p.kind === "backup") {
        setMsg({ kind: "note", text: `A full backup — ${Object.keys(p.data.decks || {}).length} decks. Importing it replaces everything.` });
        return p;
      }
      const v = store.validateCards(p.cards);
      setMsg({
        kind: v.ok.length ? "ok" : "err",
        text:
          `${v.ok.length} usable card${v.ok.length === 1 ? "" : "s"}` +
          (p.name ? ` · deck name "${p.name}"` : "") +
          (v.problems.length ? "\n" + v.problems.slice(0, 8).join("\n") + (v.problems.length > 8 ? `\n… and ${v.problems.length - 8} more` : "") : "")
      });
      return p;
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
      return null;
    }
  }

  function take(asNew: boolean) {
    const p = check();
    if (!p) return;
    try {
      if (p.kind === "backup") {
        if (!window.confirm("This is a full backup. Replace everything currently in the app?")) return;
        store.restoreBackup(p.data);
        close();
        review.refresh();
        toast("Backup restored");
        return;
      }
      const v = store.validateCards(p.cards);
      if (!v.ok.length) throw new Error("No usable cards in there.");
      if (asNew) {
        const n = window.prompt("Name the new deck:", p.name || "Imported");
        if (!n) return;
        store.addDeck(n, v.ok);
      } else {
        store.addCards(store.deck(), v.ok);
      }
      close();
      review.refresh();
      toast(v.ok.length + " cards imported");
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      const raw = String(rd.result);
      setText(raw);
      check(raw);
      toast("Loaded " + f.name + " — now pick where it goes");
    };
    rd.readAsText(f);
  }

  /* ---------- full backup ---------- */

  function saveEverything() {
    setBusy(true);
    backup
      .downloadEverything()
      .then(() => toast("Backup saved"))
      .catch((e: Error) => setMsg({ kind: "err", text: e.message }))
      .finally(() => setBusy(false));
  }

  /** Read the file and show both summaries. Nothing is replaced until the
   *  user confirms against what they can see. */
  function onBackupFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files && e.target.files[0];
    e.target.value = ""; // so picking the same file twice still fires
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const file = backup.parse(String(rd.result));
        setBusy(true);
        void backup
          .summariseCurrent()
          .then((current) => setPending({ file, incoming: backup.summarise(file), current }))
          .catch((err: Error) => setMsg({ kind: "err", text: err.message }))
          .finally(() => setBusy(false));
        setMsg(null);
      } catch (err) {
        setPending(null);
        setMsg({ kind: "err", text: (err as Error).message });
      }
    };
    rd.readAsText(f);
  }

  function confirmRestore() {
    if (!pending) return;
    setBusy(true);
    backup
      .restoreEverything(pending.file)
      .then((s) => {
        setPending(null);
        close();
        review.refresh();
        toast("Restored — " + describe(s));
      })
      .catch((e: Error) => setMsg({ kind: "err", text: e.message }))
      .finally(() => setBusy(false));
  }

  return (
    <SheetShell title="Import / export" sub={store.deck().name}>
      <div className="list">
        <Item
          title="Back up everything"
          sub="decks, progress, chats, notes and memory — one file"
          chev="↓"
          onClick={saveEverything}
        />
        <Item
          title="Restore from a backup…"
          sub="replaces everything currently in the app"
          chev="↑"
          onClick={() => backupInput.current?.click()}
        />
      </div>

      {health && (
        <div className="hintline" style={{ marginTop: 10 }}>
          {health.persisted
            ? "Storage is persistent — the browser has agreed not to evict your data."
            : health.supported
              ? "Storage is not persistent. The browser may clear it if space runs low, so keep a backup."
              : "This browser will not say whether your data is safe from eviction. Keep a backup."}
          {health.usage != null && ` · using ${fmtBytes(health.usage)}`}
          {health.quota != null && ` of ${fmtBytes(health.quota)}`}
        </div>
      )}

      {pending && (
        <div className="note" style={{ marginTop: 14, whiteSpace: "pre-line" }}>
          <strong>Restore this backup?</strong>
          {"\n"}
          From {pending.incoming.exportedAt ? new Date(pending.incoming.exportedAt).toLocaleString() : "an unknown date"}
          {"\n"}
          Backup: {describe(pending.incoming)}
          {"\n"}
          Now: {describe(pending.current)}
          {"\n\n"}
          Everything currently in the app is replaced. Save a backup of what you have first if you are unsure.
          <div className="btnrow" style={{ marginTop: 12 }}>
            <button className="btn pri" disabled={busy} onClick={confirmRestore}>
              Replace everything
            </button>
            <button className="btn sm" disabled={busy} onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <input
        ref={backupInput}
        type="file"
        accept=".json,application/json"
        style={{ display: "none" }}
        onChange={onBackupFile}
      />

      <label className="f" style={{ marginTop: 20 }}>
        Decks and logs
      </label>
      <div className="list">
        <Item title="Export this deck" sub={`${store.deck().cards.length} cards, no progress`} chev="↓" onClick={() => {
          const d = store.deck();
          U.download(U.slug(d.name) + ".json", store.exportDeck(d));
          toast("Exported");
        }} />
        <Item title="Export decks and progress" sub="every deck with its scheduling — no chats or memory" chev="↓" onClick={() => {
          U.download("drill-decks-" + U.today() + ".json", store.exportAll());
          toast("Exported");
        }} />
        <Item title="Export the insight log" sub={`${(db.notes || []).length} entries as markdown`} chev="↓" onClick={() => {
          const n = db.notes || [];
          if (!n.length) {
            toast("Log is empty");
            return;
          }
          const md = "# Insight log\n\n" + n.map((x) => "## " + new Date(x.t).toDateString() + " · " + (x.tag || "") + "\n\n" + x.text + "\n").join("\n");
          U.download("insight-log.md", md, "text/markdown");
          toast("Exported");
        }} />
        <Item title="Example decks" sub="the decks that ship with Drill" onClick={() => open({ name: "examples" })} />
      </div>

      <label className="f" style={{ marginTop: 20 }}>
        Import — paste json
      </label>
      <textarea
        className="fi"
        placeholder='[{"tag":"Notation","q":"…","a":"<p>…</p>"}]'
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="btnrow">
        <button className="btn pri" onClick={() => take(false)}>
          Add to this deck
        </button>
        <button className="btn sm" onClick={() => take(true)}>
          As new deck
        </button>
        <button className="btn sm" onClick={() => fileInput.current?.click()}>
          From file…
        </button>
        <button className="btn sm" onClick={() => check()}>
          Validate
        </button>
      </div>
      <input ref={fileInput} type="file" accept=".json,application/json" style={{ display: "none" }} onChange={onFile} />

      {msg && (
        <div style={{ marginTop: 14 }}>
          {msg.kind === "note" && <div className="note">{msg.text}</div>}
          {msg.kind === "err" && (
            <div className="err" style={{ whiteSpace: "pre-line" }}>
              {msg.text}
            </div>
          )}
          {msg.kind === "ok" && (
            <div className="hintline" style={{ color: "var(--green)", whiteSpace: "pre-line" }}>
              {msg.text}
            </div>
          )}
        </div>
      )}
    </SheetShell>
  );
}
