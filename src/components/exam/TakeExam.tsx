/* ============================================================================
 * TakeExam — one question at a time, free response, graded through the same
 * strictness as the review loop (AI.markExamAnswer mirrors AI.markRecall).
 * ========================================================================== */
import { useEffect, useState } from "react";
import * as AI from "@/services/ai";
import * as examStore from "@/services/examStore";
import type { Exam } from "@/types/exam";

export default function TakeExam({ exam, onDone }: { exam: Exam; onDone: () => void }) {
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);

  const firstUnanswered = exam.questions.findIndex((q) => !q.result);
  const activeIndex = pendingIndex ?? firstUnanswered;
  const done = activeIndex < 0;

  useEffect(() => {
    if (done) onDone();
  }, [done, onDone]);

  if (done) return null;
  const q = exam.questions[activeIndex];
  const showingFeedback = pendingIndex !== null;

  function submit() {
    if (!answer.trim()) return;
    setBusy(true);
    setError(null);
    AI.markExamAnswer(q.prompt, q.expected, answer)
      .then((result) => {
        examStore.recordAnswer(exam, q.id, answer, result);
        setPendingIndex(activeIndex);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  }

  function next() {
    setPendingIndex(null);
    setAnswer("");
  }

  const verdictClass = q.result?.verdict === "got" ? "got" : q.result?.verdict === "partial" ? "part" : "miss";

  return (
    <div>
      <div className="exam-progress">
        Question {activeIndex + 1} of {exam.questions.length} · {q.kind} · {q.difficulty}
      </div>
      <p className="exam-prompt">{q.prompt}</p>

      {!showingFeedback ? (
        <>
          <textarea
            className="fi"
            style={{ minHeight: 120 }}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="your answer…"
            autoFocus
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") submit();
            }}
          />
          {error && <div className="err">{error}</div>}
          <button className="btn pri wide" disabled={busy || !answer.trim()} onClick={submit}>
            {busy ? "Grading…" : "Submit"}
          </button>
        </>
      ) : (
        <>
          <div className="prop">
            <span className="tagmini">your answer</span>
            <div className="pa" style={{ borderTop: "none", marginTop: 6, paddingTop: 0, whiteSpace: "pre-wrap" }}>
              {answer}
            </div>
          </div>
          {q.result && (
            <div className={"verdict " + verdictClass}>
              <div className="vh">
                {q.result.verdict} · grade {q.result.grade}
              </div>
              {q.result.missing.length > 0 && (
                <ul>
                  {q.result.missing.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              )}
              <p style={{ marginTop: 8 }}>{q.result.note}</p>
            </div>
          )}
          <button className="btn pri wide" style={{ marginTop: 14 }} onClick={next}>
            {firstUnanswered < 0 ? "See report" : "Next question"}
          </button>
        </>
      )}
    </div>
  );
}
