/* ============================================================================
 * ListenBar — the reading, while it lasts: where it has got to, how fast, what
 * it has cost, and the way to stop it.
 *
 * Docked between the transcript and the composer, a sibling of `.msgs` rather
 * than a child of it, for the reason the shell keeps navigation outside the
 * scroll container: the controls for what you are hearing must not scroll
 * away with what you are reading.
 *
 * It also owns the three ways a reading ends without anyone pressing stop.
 * Leaving chat unmounts it, and it stops the voice on the way out.
 * Regenerating, editing away or deleting the reply being read stops it,
 * because reading text no longer on the screen is reading a reply that no
 * longer exists. And scrolling the transcript by hand turns following off, so
 * the page never drags a reader back while they look something up.
 * ========================================================================== */
import { useEffect, type RefObject } from "react";
import * as store from "@/services/store";
import * as chatStore from "@/services/chatStore";
import { player } from "@/services/speech/player";
import { SAMPLE_TURN, SPEEDS, engineInfo, speedLabel, switchToDevice } from "@/services/speech/choice";
import { formatCost } from "@/lib/tokens";
import { useStoreSync } from "@/hooks/useStoreSync";
import { useChat } from "@/context/ChatContext";
import { useRoute } from "@/context/RouteContext";
import Icon from "../ui/Icon";

const SCROLL_KEYS = new Set(["PageUp", "PageDown", "ArrowUp", "ArrowDown", "Home", "End", " "]);

export default function ListenBar({ scrollRef }: { scrollRef: RefObject<HTMLDivElement | null> }) {
  useStoreSync(player);
  useStoreSync(chatStore);
  const chat = useChat();
  const { conversationId, openChat } = useRoute();
  const st = player.get();
  const src = st.source;
  const active = st.status !== "idle" && !!src;

  /* Leaving chat stops the voice. Chat is the one section with controls for
     it, and a reading carrying on behind the review loop, with nothing on
     screen able to stop it, is the thing this must never do. */
  useEffect(() => () => player.stop(), []);

  /* The reply being read has been replaced, removed, or is being written
     again. Checked on every render because every one of those changes the
     conversation in place, which is what the chatStore subscription above
     re-renders for. */
  useEffect(() => {
    if (!src || src.turnId === SAMPLE_TURN) return;
    if (chat.streamingTurnId === src.turnId) {
      player.stop();
      return;
    }
    const conv = chatStore.peek(src.conversationId);
    if (!conv) return;
    const t = conv.turns.find((x) => x.id === src.turnId);
    if (!t || t.active !== src.variant || !t.variants[src.variant]) player.stop();
  });

  const turnCount = chat.conversation?.turns.length ?? 0;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !active) return;
    const off = () => {
      if (player.get().following) player.setFollowing(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (!SCROLL_KEYS.has(e.key)) return;
      if ((e.target as HTMLElement | null)?.closest?.("textarea, input, select, [contenteditable]")) return;
      off();
    };
    el.addEventListener("wheel", off, { passive: true });
    el.addEventListener("touchmove", off, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("wheel", off);
      el.removeEventListener("touchmove", off);
      window.removeEventListener("keydown", onKey);
    };
    /* turnCount and the conversation id because the scroll container is not
       there on the first render of a thread opened straight from its URL —
       the StrictMode-shaped trap CLAUDE.md describes. */
  }, [scrollRef, active, conversationId, turnCount]);

  if (!active || !src) return null;

  const sample = src.turnId === SAMPLE_TURN;
  const elsewhere = !sample && src.conversationId !== conversationId;
  const playing = st.status === "playing" || st.status === "loading";
  const hosted = st.engine !== "device";
  const secs = player.remaining();
  const left = secs < 45 ? "under a minute left" : `about ${Math.round(secs / 60)} min left`;
  const spent = hosted && st.spentChars > 0 ? ` · ${formatCost(st.spentCost)} so far` : "";
  const line =
    st.status === "error"
      ? st.error || "The voice stopped."
      : st.status === "loading"
        ? "Preparing the voice…"
        : st.status === "paused"
          ? "Paused"
          : `Reading · ${st.label}`;

  function cycleSpeed() {
    const next = SPEEDS[(SPEEDS.indexOf(st.rate) + 1) % SPEEDS.length] ?? 1;
    store.updateSettings({ speech: { ...store.settings().speech, rate: next } });
    player.setRate(next);
  }

  function backToReading() {
    player.setFollowing(true);
    if (elsewhere && src) openChat(src.conversationId, src.projectId);
  }

  return (
    <div className="listenbar" role="region" aria-label="Reading aloud">
      <div className="listenbar-inner">
        <button className="iconbtn" onClick={() => player.skip(-1)} title="Back a sentence" aria-label="Back a sentence">
          <Icon name="skip-back" size={14} />
        </button>
        <button
          className={"iconbtn listenbar-play" + (playing ? " on" : "")}
          onClick={() => player.toggle()}
          title={playing ? "Pause" : st.status === "error" ? "Retry from this sentence" : "Resume"}
          aria-label={playing ? "Pause" : st.status === "error" ? "Retry" : "Resume"}
        >
          <Icon name={playing ? "pause" : st.status === "error" ? "refresh" : "play"} size={15} />
        </button>
        <button className="iconbtn" onClick={() => player.skip(1)} title="Next sentence" aria-label="Next sentence">
          <Icon name="skip-forward" size={14} />
        </button>

        <div className="listenbar-text">
          <span className={"t" + (st.status === "error" ? " err" : "")} role="status" aria-live="polite">
            {line}
          </span>
          <span className="s">
            Sentence {Math.min(st.index + 1, src.sentences.length)} of {src.sentences.length} · {left}
            {spent}
          </span>
        </div>

        {st.status === "error" && hosted && engineInfo("device").verdict.can && (
          <button className="cbtn" onClick={switchToDevice}>
            Use this device's voice
          </button>
        )}
        {(elsewhere || !st.following) && (
          <button className="cbtn ghost" onClick={backToReading}>
            {elsewhere ? "Back to the reply" : "Follow"}
          </button>
        )}
        <button className="cbtn ghost listenbar-speed" onClick={cycleSpeed} title="Speed — click for the next one">
          {speedLabel(st.rate)}
        </button>
        <button className="iconbtn" onClick={() => player.stop()} title="Stop reading" aria-label="Stop reading">
          <Icon name="close" size={13} />
        </button>
      </div>
    </div>
  );
}
