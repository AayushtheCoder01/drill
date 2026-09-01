/* ============================================================================
 * ExamReport — score, weakest topics, per-question verdict, and the three
 * follow-through actions: wrong answer -> card, wrong answer -> reset that
 * card's FSRS state (a card passed in drilling but failed in an exam was a
 * false positive), weak topic -> more questions.
 * ========================================================================== */
import { useState } from "react";
import * as store from "@/services/store";
import { esc } from "@/lib/util";
import { useToast } from "@/context/ToastContext";
import ProposalsBlock from "../ProposalsBlock";
import type { Exam, Difficulty } from "@/types/exam";
import type { Card } from "@/types";

function weakTopics(exam: Exam): string[] {
  const misses = exam.questions.filter((q) => q.result && q.result.verdict !== "got").flatMap((q) => q.result!.missing);
  return Array.from(new Set(misses)).slice(0, 6);
}

export default function ExamReport({ exam, onExtend }: { exam: Exam; onExtend: (level?: Difficulty) => void }) {
  const toast = useToast();
  const [cardDraft, setCardDraft] = useState<{ qid: string; card: Card } | null>(null);

  const answered = exam.questions.filter((q) => q.result);
  const scorePct = answered.length ? Math.round((answered.reduce((s, q) => s + q.result!.grade, 0) / (answered.length * 4)) * 100) : 0;
  const weak = weakTopics(exam);

  function resetCard(cardId: string) {
    const deck = Object.values(store.get().decks).find((d) => d.srs[cardId]);
    if (!deck) {
      toast("Could not find that card — it may have been deleted");
      return;
    }
    delete deck.srs[cardId];
    store.saveNow();
    toast("Reset — it will come up as new next time you review");
  }

  function draftCard(qid: string, prompt: string, expected: string) {
    const card = store.normCard({
      tag: exam.title.slice(0, 40) || "Exam",
      q: prompt,
      a: "<p>" + esc(expected) + "</p>",
      sourceRef: { kind: "exam", id: exam.id }
    });
    setCardDraft({ qid, card });
  }

  return (
    <div>
      <div className="exam-report-score">
        <div className="bignum">{scorePct}%</div>
        <div className="bigsub">
          {answered.length} question{answered.length === 1 ? "" : "s"} · {exam.level}
        </div>
      </div>

      {weak.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <label className="f">Weakest spots</label>
          <ul className="jrnl-list">
            {weak.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <label className="f">Per question</label>
      {exam.questions.map((q) => (
        <div key={q.id} className="exam-qrow">
          <div className="eqh">
            <span className="tagmini">
              {q.kind} · {q.difficulty}
            </span>
            {q.result && (
              <span className={"chip " + (q.result.verdict === "got" ? "tag" : "leech")}>{q.result.verdict}</span>
            )}
          </div>
          <div className="eqp">{q.prompt}</div>
          {q.answer && <div className="eqa">You: {q.answer}</div>}
          {q.result && q.result.missing.length > 0 && <div className="eqa">Missed: {q.result.missing.join("; ")}</div>}

          {q.result && q.result.verdict !== "got" && (
            <div className="btnrow" style={{ marginTop: 8 }}>
              <button className="btn sm" onClick={() => draftCard(q.id, q.prompt, q.expected)}>
                Turn into a card
              </button>
              {q.sourceRefs
                .filter((r) => r.kind === "card")
                .map((r) => (
                  <button key={r.id} className="btn sm" onClick={() => resetCard(r.id)}>
                    Reset that card's progress
                  </button>
                ))}
            </div>
          )}

          {cardDraft?.qid === q.id && (
            <div style={{ marginTop: 10 }}>
              <ProposalsBlock
                label="One card from this question"
                cards={[cardDraft.card]}
                onCommitted={() => {
                  toast("Card added");
                  setCardDraft(null);
                }}
              />
            </div>
          )}
        </div>
      ))}

      <div className="btnrow" style={{ marginTop: 18 }}>
        <button className="btn" onClick={() => onExtend()}>
          More questions
        </button>
        <button className="btn" onClick={() => onExtend("synthesise")}>
          Harder
        </button>
      </div>
    </div>
  );
}
