/* ============================================================================
 * ChatPane — the tutor, over the card you just failed.
 *
 * The highest-value teaching moment in the app: you have just tried to recall
 * something, got it wrong, and the correct answer is on the screen in front of
 * you. This is where an explanation actually lands.
 *
 * It used to be a dead end. The exchange was three `AI.chat` calls held in a
 * ref, not a `Conversation` — so it could not be reopened, searched, branched,
 * continued, or turned into cards, nothing it surfaced reached memory, and it
 * evaporated the moment the sheet closed. The best conversation you had all
 * day was the one the app kept nothing of.
 *
 * "Continue in chat" fixes that without a second chat surface: the exchange is
 * written out as a real conversation, with this card attached and the review
 * context sources on it, and the chat section takes it from there. One
 * conversation model, one place transcripts live.
 * ========================================================================== */
import { useEffect, useRef, useState } from "react";
import * as AI from "@/services/ai";
import * as store from "@/services/store";
import * as chatStore from "@/services/chatStore";
import { useReview } from "@/context/ReviewContext";
import { useRoute } from "@/context/RouteContext";
import { useSheet } from "@/context/SheetContext";
import SheetShell from "../SheetShell";
import type { Card, ChatMessage } from "@/types";
import CardHtml from "../CardHtml";

interface Bubble {
  role: "user" | "assistant";
  html?: string;
  text?: string;
  loading?: boolean;
  error?: string;
}

/** The card front as plain text, for a title. Local rather than importing
 *  lib/util here for one call. */
function U_strip(html: string): string {
  return String(html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

const STARTERS: Record<string, [string, string]> = {
  deep: ["Why is this true? Give me the mechanism, not the restatement — and a limiting case where it would break.", "Why is this true?"],
  test: [
    "Ask me one harder question that uses this idea in a situation the card does not cover. Do not answer it yet — wait for my attempt, then mark it.",
    "Test me on it"
  ],
  link: ["Where does this idea show up later in machine learning? One concrete place, and what changes when it gets there.", "Where does it show up next?"]
};

export default function ChatPane({ card }: { card: Card }) {
  const review = useReview();
  const { openChat } = useRoute();
  const { close } = useSheet();
  const msgsRef = useRef<ChatMessage[]>([{ role: "system", content: AI.tutorSystem(card) }]);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [showStarters, setShowStarters] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const askedInitial = useRef(false);

  function scrollDown() {
    requestAnimationFrame(() => {
      const el = bodyRef.current?.closest(".sheet-body") as HTMLElement | null;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  function ask(text: string, label?: string) {
    setShowStarters(false);
    setBubbles((prev) => [...prev, { role: "user", text: label || text }, { role: "assistant", loading: true }]);
    msgsRef.current = [...msgsRef.current, { role: "user", content: text }];
    setSending(true);

    AI.chat(msgsRef.current, {
      temperature: 0.6,
      maxTokens: 2048,
      onToken: (_t, acc) => {
        setBubbles((prev) => {
          const next = prev.slice();
          next[next.length - 1] = { role: "assistant", html: AI.formatReply(acc) };
          return next;
        });
        scrollDown();
      }
    })
      .then((full) => {
        setBubbles((prev) => {
          const next = prev.slice();
          next[next.length - 1] = { role: "assistant", html: full ? AI.formatReply(full) : "<em>empty reply</em>" };
          return next;
        });
        msgsRef.current = [...msgsRef.current, { role: "assistant", content: full }];
      })
      .catch((e: Error) => {
        setBubbles((prev) => {
          const next = prev.slice();
          next[next.length - 1] = { role: "assistant", error: e.message };
          return next;
        });
      })
      .finally(() => {
        setSending(false);
        scrollDown();
      });
  }

  useEffect(() => {
    if (askedInitial.current) return;
    askedInitial.current = true;
    if (review.lastAttempt) {
      ask(
        'Here is what I wrote from memory before seeing the back of the card:\n\n"' +
          review.lastAttempt +
          '"\n\nTell me what my version is missing or getting subtly wrong, then push me one level deeper.',
        "Mark what I wrote, then push deeper"
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function send() {
    const v = input.trim();
    if (!v) return;
    setInput("");
    ask(v);
  }

  /**
   * Write this exchange out as a real conversation and open it.
   *
   * The turns are rebuilt from `msgsRef` rather than from the rendered
   * bubbles: the bubbles hold the *label* a starter was shown under ("Test me
   * on it"), and what actually went up the wire was the full prompt. A
   * transcript that shows the label would read as a conversation the model
   * never had.
   */
  function continueInChat() {
    const deck = store.pool().find((d) => d.cards.some((c) => c.id === card.id)) || store.deck();
    const c = chatStore.create({
      title: "Card: " + U_strip(card.q).slice(0, 48),
      personaId: "tutor",
      /* The card's own deck, plus what every conversation starts with — the
         thread is about this card, but the follow-up two messages in rarely
         is. */
      context: [{ kind: "deck", deckId: deck.id }, ...chatStore.defaultContext()]
    });
    /* The system message stays behind: it was built for a card sheet, and a
       conversation rebuilds its own from the persona and the sources above,
       fresh, on every send. Carrying a frozen one across would pin this
       thread to what was true the moment you opened the sheet. */
    for (const m of msgsRef.current) {
      if (m.role === "system") continue;
      chatStore.addTurn(c, chatStore.makeTurn(m.role as "user" | "assistant", m.content));
    }
    c.titled = true;
    chatStore.persist(c, true);
    close();
    openChat(c.id);
  }

  return (
    <SheetShell title="Go deeper" sub={card.tag}>
      <CardHtml className="chatctx" html={card.q} />
      {bubbles.length > 0 && (
        <div className="btnrow">
          <button className="btn sm" disabled={sending} onClick={continueInChat}>
            Continue in Chat →
          </button>
        </div>
      )}
      <div className="chat" ref={bodyRef}>
        {bubbles.map((b, i) =>
          b.role === "user" ? (
            <div key={i} className="bub u">
              {b.text}
            </div>
          ) : b.loading ? (
            <div key={i} className="bub a">
              <span className="working-stick sm" aria-label="thinking">
                <i />
                <i style={{ animationDelay: "0.12s" }} />
                <i style={{ animationDelay: "0.24s" }} />
              </span>
            </div>
          ) : b.error ? (
            <div key={i} className="err">
              {b.error}
            </div>
          ) : (
            <div key={i} className="bub a" dangerouslySetInnerHTML={{ __html: b.html || "" }}></div>
          )
        )}
      </div>
      {showStarters && (
        <div className="btnrow" style={{ marginBottom: 12 }}>
          {Object.entries(STARTERS).map(([k, [text, label]]) => (
            <button key={k} className="btn sm" onClick={() => ask(text, label)}>
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="chatbar">
        <input
          className="fi"
          placeholder="ask a follow-up…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              send();
            }
          }}
        />
        <button className="btn sm" disabled={sending} onClick={send}>
          ↑
        </button>
      </div>
    </SheetShell>
  );
}
