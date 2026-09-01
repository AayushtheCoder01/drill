import { useEffect, useRef, useState } from "react";
import * as store from "@/services/store";
import * as AI from "@/services/ai";
import { useReview } from "@/context/ReviewContext";
import { useSheet } from "@/context/SheetContext";
import Done from "./Done";
import Icon from "./ui/Icon";
import CardHtml from "./CardHtml";

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: any) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}

function chipsFor(o: NonNullable<ReturnType<typeof store.nextCard>>) {
  const chips: { cls: string; text: string }[] = [{ cls: "chip tag", text: o.def.tag }];
  if (store.settings().mix) chips.push({ cls: "chip deck", text: o.deck.name });
  if (!o.st.reps) chips.push({ cls: "chip", text: "first look" });
  else if (o.st.state === "relearning") chips.push({ cls: "chip", text: "relearning" });
  if (store.isLeech(o.st)) chips.push({ cls: "chip leech", text: `leech · ${o.st.lapses} lapses` });
  return chips;
}

export default function Stage() {
  const review = useReview();
  const { open } = useSheet();
  const [marking, setMarking] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [markError, setMarkError] = useState("");
  const [micOn, setMicOn] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const answerRef = useRef<HTMLDivElement | null>(null);

  const { current, revealed, attempt, lastAttempt, lastMark } = review;

  // Trigger AI marking once, right after reveal.
  useEffect(() => {
    if (!revealed || !current) return;
    if (!lastAttempt || !store.settings().mark || !AI.ready().ok) return;
    let cancelled = false;
    setMarking("loading");
    AI.markRecall(current.def, lastAttempt)
      .then((j) => {
        if (cancelled) return;
        review.setMark(j);
        setMarking("done");
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setMarkError(e.message);
        setMarking("error");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed, current?.def.id]);

  useEffect(() => {
    if (revealed) answerRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [revealed]);

  if (!current) return <Done />;

  const o = current;
  const recall = store.settings().recall;

  function toggleMic() {
    if (recRef.current) {
      recRef.current.stop();
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = store.settings().lang === "hinglish" ? "en-IN" : "en-US";
    rec.interimResults = false;
    rec.continuous = true;
    rec.onresult = (e: any) => {
      let t = "";
      for (let i = e.resultIndex; i < e.results.length; i++) t += e.results[i][0].transcript;
      review.setAttempt((review.attempt ? review.attempt + " " : "") + t.trim());
    };
    rec.onend = () => {
      recRef.current = null;
      setMicOn(false);
    };
    rec.onerror = () => {
      recRef.current = null;
      setMicOn(false);
    };
    rec.start();
    recRef.current = rec;
    setMicOn(true);
  }

  function onRecallKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      review.reveal();
    }
  }

  const hasMicSupport = typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  return (
    <main id="stage">
      <div className="card" aria-live="polite">
        <div className="chips">
          {chipsFor(o).map((c, i) => (
            <span key={i} className={c.cls}>
              {c.text}
            </span>
          ))}
        </div>
        <CardHtml className="q" html={o.def.q} />

        {!revealed && recall && (
          <div className="recall">
            <label>Write it from memory first</label>
            <textarea
              placeholder="what do you actually remember? one or two lines is fine"
              value={attempt}
              onChange={(e) => review.setAttempt(e.target.value)}
              onKeyDown={onRecallKeyDown}
            />
            <div className="rr">
              {hasMicSupport && (
                <button
                  className={"mic" + (micOn ? " on" : "")}
                  title={micOn ? "Stop dictating" : "Dictate"}
                  aria-label={micOn ? "Stop dictating" : "Dictate"}
                  aria-pressed={micOn}
                  onClick={toggleMic}
                >
                  <Icon name="mic" size={15} />
                </button>
              )}
            </div>
          </div>
        )}

        {revealed && (
          <>
            <div className="divider"></div>
            <div ref={answerRef}>
              <CardHtml className="a" html={o.def.a} />
            </div>

            {lastAttempt && store.settings().mark && AI.ready().ok && (
              <div className={"verdict " + (marking === "loading" ? "part" : marking === "error" ? "part" : lastMark ? verdictClass(lastMark.verdict) : "part")}>
                {marking === "loading" && (
                  <div className="vh">
                    <span className="spin"></span> marking your recall
                  </div>
                )}
                {marking === "error" && (
                  <>
                    <div className="vh">marking failed</div>
                    <div>{markError}</div>
                  </>
                )}
                {marking === "done" && lastMark && (
                  <>
                    <div className="vh">{verdictHead(lastMark.verdict)}</div>
                    {lastMark.note && <div>{lastMark.note}</div>}
                    {lastMark.missing && lastMark.missing.length > 0 && (
                      <ul>
                        {lastMark.missing.slice(0, 3).map((m, i) => (
                          <li key={i}>{m}</li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="cardacts">
              <button className="linkbtn" onClick={() => open({ name: "chat", card: o.def })}>
                <Icon name="sparkle" size={12} /> Go deeper
              </button>
              <button className="linkbtn" onClick={() => open({ name: "editor", deckId: o.deck.id, cardId: o.def.id })}>
                Edit
              </button>
              {store.isLeech(o.st) ? (
                <button className="linkbtn danger" onClick={() => open({ name: "fix", item: o })}>
                  Rewrite this card
                </button>
              ) : (
                <button className="linkbtn" onClick={() => open({ name: "notes", card: o.def })}>
                  Log insight
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function verdictClass(v: string): string {
  return v === "got" ? "got" : v === "missed" ? "miss" : "part";
}
function verdictHead(v: string): string {
  return v === "got" ? "you had it" : v === "missed" ? "you did not have it" : "partly there";
}
