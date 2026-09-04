/* ============================================================================
 * ChatEmpty — what you see before the first message.
 *
 * The starters are not decoration. A blank box invites "explain transformers"
 * and gets you a Wikipedia paragraph; these seed the modes that are actually
 * worth the tokens, and three of the six only exist because the app knows
 * your decks.
 * ========================================================================== */
import * as store from "@/services/store";
import type { CreateOpts } from "@/services/chatStore";
import Icon, { type IconName } from "../ui/Icon";

interface Props {
  ready: { ok: boolean; why?: string };
  onStart: (prompt: string, opts?: CreateOpts) => void;
  onPrefill: (text: string) => void;
}

export default function ChatEmpty({ ready, onStart, onPrefill }: Props) {
  const counts = store.counts();
  const stats = store.stats();

  const starters: { t: string; s: string; icon: IconName; go: () => void }[] = [
    {
      t: "Work on my weak spots",
      s: `${stats.leech} leech${stats.leech === 1 ? "" : "es"} · finds what they have in common instead of drilling them`,
      icon: "cards",
      go: () =>
        onStart(
          "Look at the cards I keep failing. Find what they have in common — the underlying idea I have not " +
            "actually understood — and teach me that, rather than going through the cards one by one.",
          { title: "Weak spots", personaId: "tutor", context: [{ kind: "weak", deckId: null }] }
        )
    },
    {
      t: "Quiz me on what's due",
      s: `${counts.due} due · one question at a time, marks each answer`,
      icon: "exam",
      go: () =>
        onStart(
          "Quiz me on the cards that are due right now. Ask one question at a time, wait for my answer, then " +
            "tell me what I missed before moving on. Do not show me the answer until I have attempted it.",
          { title: "Quiz session", personaId: "socratic", context: [{ kind: "due", deckId: null }] }
        )
    },
    {
      t: "Explain something new",
      s: "From first principles, with a worked example",
      icon: "sparkle",
      go: () => onPrefill("Explain ")
    },
    {
      t: "Check my understanding",
      s: "You explain it, the model finds the holes",
      icon: "journal",
      go: () =>
        onStart("I am going to explain a concept to you in my own words. Ask me which one, then pick it apart.", {
          title: "Feynman check",
          personaId: "feynman"
        })
    },
    {
      t: "Dig into a paper or my notes",
      s: "Paste or attach text, then interrogate it",
      icon: "paperclip",
      go: () => onPrefill("Here are my notes. Pull out what is worth remembering and what I have glossed over:\n\n")
    },
    {
      t: "Debug some code",
      s: "Shape-aware, names the failing input first",
      icon: "pencil",
      go: () => onStart("I have a bug. Ask me for the code and the error.", { title: "Debugging", personaId: "code" })
    }
  ];

  return (
    <div className="chat-empty">
      <div className="chat-empty-icon">
        <Icon name="bubble" size={28} />
      </div>
      <h2>What are we working on?</h2>
      <p>
        {ready.ok
          ? "This chat can see your decks, your weak cards and your insight log — and anything it tells you can become flashcards in one click."
          : ready.why}
      </p>
      <div className="starters">
        {starters.map((s) => (
          <button key={s.t} className="starter" onClick={s.go} disabled={!ready.ok}>
            <div className="starter-icon">
              <Icon name={s.icon} size={16} />
            </div>
            <div className="starter-content">
              <span className="t">{s.t}</span>
              <span className="s">{s.s}</span>
            </div>
            <Icon name="send" size={12} className="starter-arrow" />
          </button>
        ))}
      </div>
    </div>
  );
}
