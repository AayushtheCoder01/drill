/* ============================================================================
 * deviceEngine.ts — reading aloud with the voices the browser already has.
 *
 * Free, offline, and the only engine that needs no key — which makes it the
 * fallback for every other one. It is also one of the least dependable APIs
 * in the web platform, and each rule below answers a documented way it fails:
 *
 *   One utterance per sentence. Chrome stops a single utterance after about
 *   fifteen seconds, with no event and no error, so a paragraph handed over
 *   whole is cut off mid-word. The player gives this engine one sentence per
 *   clip, and lib/speech/words keeps every sentence under that length.
 *
 *   A reference to the live utterance is kept. Chrome can garbage-collect an
 *   utterance nothing else points at while it is still speaking, and its
 *   `end` event then never fires — the reading simply stops.
 *
 *   Pause cancels; resume says the sentence again. On Android pause() *is*
 *   cancel, and on desktop a paused synthesiser sometimes will not resume.
 *   Restarting one sentence works everywhere and costs a few seconds at most.
 *
 *   Speed is clamped to 0.5–2. The API accepts up to 10, and Chrome's voices
 *   stop producing sound above 2.
 *
 *   Every event is checked against the utterance it belongs to. Cancelling
 *   fires `end`, or an `interrupted` error, on the utterance being cancelled —
 *   sometimes after the next one has already started.
 * ========================================================================== */
import * as voices from "./voices";
import type { Clip, EngineEvents, PlaybackEngine } from "./player";

/** A sentence that has neither started nor failed after this long is stuck,
 *  a state Chrome reaches after a network voice fails. Saying so beats a
 *  button that looks as if it is thinking for ever. */
const START_TIMEOUT_MS = 8000;

/** Speaking straight after cancel() is silently dropped by Chrome now and
 *  then; a moment in between is the known cure. Only spent when something
 *  was actually cancelled, so reading straight through is not slowed. */
const AFTER_CANCEL_MS = 60;

function deviceError(code: string): string {
  switch (code) {
    case "network":
      return "This voice needs the internet and could not reach it. Pick a voice without “online” under Settings → Listening.";
    case "voice-unavailable":
    case "language-unavailable":
      return "That voice is not available any more. Pick another under Settings → Listening.";
    case "audio-busy":
    case "audio-hardware":
    case "synthesis-unavailable":
      return "The speaker is busy or unavailable. Try again in a moment.";
    case "not-allowed":
      return "The browser blocked speech until the page is clicked — press play again.";
    default:
      return `This browser's voice stopped (${code || "no reason given"}).`;
  }
}

/** Where a word starts at or before a fraction of the way through the text. */
function wordStart(text: string, fraction: number): number {
  const at = Math.floor(Math.max(0, Math.min(1, fraction)) * text.length);
  const space = text.lastIndexOf(" ", at);
  return space < 0 ? 0 : space + 1;
}

export function createDeviceEngine(voiceURI: string, label: string): PlaybackEngine {
  let current: SpeechSynthesisUtterance | null = null;
  let playing: { clip: Clip; ev: EngineEvents } | null = null;
  let rate = 1;
  let paused = false;
  let released = false;
  let token = 0;
  let watchdog: ReturnType<typeof setTimeout> | null = null;

  const synth = () => window.speechSynthesis;

  function clearWatchdog() {
    if (watchdog) clearTimeout(watchdog);
    watchdog = null;
  }

  function cancel() {
    clearWatchdog();
    current = null;
    try {
      synth().cancel();
    } catch {
      /* nothing to cancel */
    }
  }

  function speak(clip: Clip, from: number, ev: EngineEvents) {
    const offset = from > 0 ? wordStart(clip.text, from) : 0;
    const text = clip.text.slice(offset);
    const u = new SpeechSynthesisUtterance(text);
    const v = voices.find(voiceURI);
    if (v) {
      u.voice = v;
      u.lang = v.lang;
    }
    u.rate = Math.min(2, Math.max(0.5, rate));
    u.onstart = () => {
      if (u !== current) return;
      clearWatchdog();
      ev.started();
    };
    /* Word boundaries arrive on Windows and macOS and never on Android or
       Linux. Where they do, the sentence highlight can move within a long
       clip; where they do not, it moves a sentence at a time, which is the
       granularity this engine is given anyway. */
    u.onboundary = (e) => {
      if (u !== current || !clip.text.length) return;
      ev.progress((offset + e.charIndex) / clip.text.length);
    };
    u.onend = () => {
      if (u !== current) return;
      clearWatchdog();
      current = null;
      ev.ended();
    };
    u.onerror = (e) => {
      if (u !== current) return;
      /* Cancelling our own utterance reports itself as an error. */
      if (e.error === "interrupted" || e.error === "canceled") return;
      clearWatchdog();
      current = null;
      ev.failed(new Error(deviceError(e.error)));
    };

    current = u;
    const s = synth();
    if (s.paused) s.resume();
    s.speak(u);
    clearWatchdog();
    watchdog = setTimeout(() => {
      if (u !== current || paused || released) return;
      cancel();
      ev.failed(new Error("This browser's voice did not start. Reload the page, or pick another voice under Settings → Listening."));
    }, START_TIMEOUT_MS);
  }

  return {
    id: "device",
    label,
    maxChars: 0,

    play(clip, from, r, ev) {
      if (released) return;
      const my = ++token;
      rate = r;
      paused = false;
      playing = { clip, ev };
      let busy = current !== null;
      try {
        busy = busy || synth().speaking || synth().pending;
      } catch {
        /* treat an unreadable synthesiser as idle */
      }
      cancel();
      if (!busy) {
        speak(clip, from, ev);
        return;
      }
      setTimeout(() => {
        if (my === token && !paused && !released) speak(clip, from, ev);
      }, AFTER_CANCEL_MS);
    },

    prepare() {
      /* Nothing to fetch: the voice lives in the browser. */
    },

    pause() {
      if (!playing) return;
      paused = true;
      token++;
      cancel();
    },

    resume() {
      if (!playing || released) return;
      paused = false;
      const my = ++token;
      const { clip, ev } = playing;
      setTimeout(() => {
        if (my === token && !paused && !released) speak(clip, 0, ev);
      }, AFTER_CANCEL_MS);
    },

    setRate(r) {
      /* An utterance cannot change speed once it has started, so the new
         speed applies from the next sentence — a few seconds away at most. */
      rate = r;
    },

    release() {
      released = true;
      paused = false;
      playing = null;
      token++;
      cancel();
    }
  };
}
