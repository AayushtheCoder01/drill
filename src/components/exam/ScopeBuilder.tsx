/* ============================================================================
 * ScopeBuilder — date phrase or picker, deck/tag filters, resolved locally
 * before any call is spent: "14–20 March · 4 entries · 23 cards" is visible
 * the instant you finish typing (see lib/examScope.ts, lib/when.ts).
 * ========================================================================== */
import { useMemo, useState } from "react";
import * as store from "@/services/store";
import * as AI from "@/services/ai";
import * as examStore from "@/services/examStore";
import { resolveScope } from "@/lib/examScope";
import { useToast } from "@/context/ToastContext";
import type { Difficulty } from "@/types/exam";

const LEVELS: Difficulty[] = ["recall", "apply", "analyse", "synthesise"];
const LEVEL_HINT: Record<Difficulty, string> = {
  recall: "mostly single-fact questions",
  apply: "use it on a new case",
  analyse: "connect and derive across sources",
  synthesise: "the hardest mix, heaviest on connect/derive"
};

export default function ScopeBuilder({ projectId, onCreated }: { projectId: string; onCreated: (examId: string) => void }) {
  const toast = useToast();
  const [when, setWhen] = useState("");
  const [deckIds, setDeckIds] = useState<string[]>([]);
  const [tags, setTags] = useState("");
  const [level, setLevel] = useState<Difficulty>("apply");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decks = store.decksOf(projectId);
  const tagList = useMemo(() => tags.split(",").map((t) => t.trim()).filter(Boolean), [tags]);
  const resolved = useMemo(
    () => resolveScope({ projectId, when, deckIds, tags: tagList }),
    [projectId, when, deckIds, tagList]
  );

  function toggleDeck(id: string) {
    setDeckIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function generate() {
    if (!resolved.counts.entries && !resolved.counts.cards) {
      toast("Nothing matches this scope yet");
      return;
    }
    setBusy(true);
    setError(null);
    AI.generateExam(resolved.material, level, [])
      .then((questions) => {
        const title = resolved.scope.label + (tagList.length ? ` · ${tagList.join(", ")}` : "");
        const exam = examStore.create({ projectId, title, scope: resolved.scope, level, questions });
        onCreated(exam.id);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  }

  return (
    <div>
      <label className="f">When — "last week", "this month", a date, or leave blank for everything</label>
      <input className="fi" value={when} onChange={(e) => setWhen(e.target.value)} placeholder="e.g. last week, 3 days ago, march" />
      {when.trim() && resolved.unparsed && <div className="hintline">Could not parse that — showing everything below instead.</div>}

      {decks.length > 0 && (
        <>
          <label className="f">Decks — none selected means every deck in this project</label>
          <div className="list" style={{ marginBottom: 14 }}>
            {decks.map((d) => (
              <button key={d.id} className={"item" + (deckIds.includes(d.id) ? " on" : "")} onClick={() => toggleDeck(d.id)}>
                <span className="grow">
                  <span className="t">{d.name}</span>
                  <span className="s">{d.cards.length} cards</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      <label className="f">Tags — comma-separated, optional</label>
      <input className="fi" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="e.g. Backprop, Notation" />

      <label className="f">Difficulty</label>
      <div className="seg" style={{ marginBottom: 6 }}>
        {LEVELS.map((l) => (
          <button key={l} className={level === l ? "on" : ""} onClick={() => setLevel(l)}>
            {l}
          </button>
        ))}
      </div>
      <div className="hintline">{LEVEL_HINT[level]}</div>

      <div className="exam-counts">
        {resolved.counts.entries} journal {resolved.counts.entries === 1 ? "entry" : "entries"} · {resolved.counts.cards} cards ·{" "}
        {resolved.scope.label}
      </div>

      {error && <div className="err">{error}</div>}
      <button className="btn pri wide" disabled={busy} onClick={generate}>
        {busy ? "Building the exam…" : "Generate exam"}
      </button>
    </div>
  );
}
