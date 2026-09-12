/* ============================================================================
 * player.ts — the one reply being read aloud, and everything you can do to it.
 *
 * A module singleton with the subscribe/getVersion shape every store in this
 * app has, so the Listen button, the bar above the composer and the sentence
 * highlight all read one answer to "what is playing" — and so starting a
 * second reply stops the first rather than talking over it.
 *
 * It knows sentences and clips, and nothing about sound. A clip is a run of
 * sentences small enough for one request; an engine turns a clip into audio
 * and reports back in events. Engines are handed in rather than imported, for
 * the reason services/agent/loop.ts takes `chat` injected: it is the only way
 * the queue — order, skipping, pausing, a failure halfway through, a late
 * event from a clip already skipped — can be tested with no speakers, no
 * network and no DOM.
 *
 * Every engine callback is tagged with a generation and ignored once the
 * player has moved on. Browsers fire `end` on an utterance they were just
 * told to cancel, and an audio element reports `ended` for a clip that has
 * already been replaced; without the check, pressing skip twice in quick
 * succession jumps three sentences.
 * ========================================================================== */
import { planChunks, secondsFor } from "@/lib/speech/words";
import type { SpeechEngineId } from "@/types";

export type ListenStatus = "idle" | "loading" | "playing" | "paused" | "error";

/** One reply, as what a voice reads. */
export interface ListenSource {
  conversationId: string;
  projectId: string;
  turnId: string;
  /** The version of the reply. Regenerating makes a new one, and reading the
   *  replaced text aloud over the top of it would be reading something that
   *  is no longer on the screen. */
  variant: number;
  title: string;
  /** Spoken text, one entry per sentence, in reading order. */
  sentences: string[];
}

/** A run of sentences that travels as one request. */
export interface Clip {
  first: number;
  last: number;
  text: string;
}

export interface EngineEvents {
  /** Sound has actually started. */
  started(): void;
  /** How far through the clip, 0..1. */
  progress(fraction: number): void;
  ended(): void;
  failed(err: Error): void;
}

export interface PlaybackEngine {
  readonly id: SpeechEngineId;
  /** What the bar calls it — "kokoro-82m via OpenRouter". */
  readonly label: string;
  /** Characters one clip may carry. 0 means one sentence per clip, which is
   *  what a browser voice needs: it cannot report how far through a long
   *  utterance it is on every platform, so the sentence *is* the progress. */
  readonly maxChars: number;
  /** Replace whatever is playing with this clip, starting a fraction of the
   *  way in. */
  play(clip: Clip, from: number, rate: number, ev: EngineEvents): void;
  /** Start fetching a clip that is coming up next. */
  prepare(clip: Clip): void;
  pause(): void;
  resume(): void;
  setRate(rate: number): void;
  /** Stop, and let go of every resource. The engine is not used again. */
  release(): void;
}

export interface ListenState {
  status: ListenStatus;
  source: ListenSource | null;
  /** The sentence being read. */
  index: number;
  engine: SpeechEngineId | null;
  label: string;
  rate: number;
  /** Keep the sentence being read on screen. Off the moment the reader
   *  scrolls by hand, back on from the bar. */
  following: boolean;
  error: string | null;
  /** What this reading has spent. Hosted voices only; replays add nothing. */
  spentChars: number;
  spentCost: number | undefined;
}

export interface PlayOptions {
  rate: number;
  following: boolean;
  /** The sentence to start at — where a selection began — or the first. */
  from?: number;
}

export interface Player {
  subscribe(fn: () => void): () => void;
  getVersion(): number;
  get(): ListenState;
  play(source: ListenSource, engine: PlaybackEngine, opts: PlayOptions): void;
  pause(): void;
  resume(): void;
  toggle(): void;
  skip(delta: number): void;
  seek(sentence: number): void;
  setRate(rate: number): void;
  setFollowing(on: boolean): void;
  /** A different voice mid-reading: carry on from this sentence with it. */
  swapEngine(engine: PlaybackEngine): void;
  /** Record money spent on a source's audio, for the bar's running total. */
  spend(source: ListenSource, chars: number, cost: number | undefined): void;
  /** Seconds of reading left, roughly. */
  remaining(): number;
  stop(): void;
}

function idleState(rate: number, following: boolean): ListenState {
  return {
    status: "idle",
    source: null,
    index: 0,
    engine: null,
    label: "",
    rate,
    following,
    error: null,
    spentChars: 0,
    spentCost: undefined
  };
}

export function buildClips(sentences: string[], maxChars: number): Clip[] {
  return planChunks(
    sentences.map((s) => s.length),
    maxChars
  ).map((ids) => ({
    first: ids[0],
    last: ids[ids.length - 1],
    text: ids.map((i) => sentences[i]).join(" ")
  }));
}

/** Where a sentence starts inside its clip, as a fraction of the clip. */
export function fractionOf(clip: Clip, sentence: number, sentences: string[]): number {
  if (!clip.text.length) return 0;
  let at = 0;
  for (let i = clip.first; i < sentence && i <= clip.last; i++) at += sentences[i].length + 1;
  return Math.min(1, at / clip.text.length);
}

/** Which sentence a point part-way through a clip falls in. Estimated from
 *  character counts: a hosted voice returns audio with no timing inside it,
 *  and speech is even enough that a boundary lands within a word or two of
 *  where this puts it. */
export function sentenceAt(clip: Clip, fraction: number, sentences: string[]): number {
  const target = Math.max(0, Math.min(1, fraction)) * clip.text.length;
  let at = 0;
  for (let i = clip.first; i <= clip.last; i++) {
    at += sentences[i].length + 1;
    if (target < at) return i;
  }
  return clip.last;
}

export function createPlayer(): Player {
  let state: ListenState = idleState(1, true);
  let version = 0;
  const listeners = new Set<() => void>();

  let engine: PlaybackEngine | null = null;
  let clips: Clip[] = [];
  /* Bumped whenever the player moves on. A callback carrying an older value
     describes a clip nobody is listening to any more. */
  let gen = 0;

  function set(patch: Partial<ListenState>) {
    state = { ...state, ...patch };
    version++;
    listeners.forEach((l) => l());
  }

  function clipOf(sentence: number): number {
    const i = clips.findIndex((c) => sentence >= c.first && sentence <= c.last);
    return i < 0 ? 0 : i;
  }

  function start(ci: number, from: number) {
    const src = state.source;
    const eng = engine;
    const clip = clips[ci];
    if (!src || !eng || !clip) return;
    const my = ++gen;
    set({ status: "loading", index: sentenceAt(clip, from, src.sentences), error: null });
    eng.play(clip, from, state.rate, {
      started() {
        if (my !== gen) return;
        if (state.status !== "playing") set({ status: "playing" });
        /* Fetched ahead only once this clip is actually sounding, so what is
           paid for is what is being heard plus one clip — never a queue of
           requests for a reply that gets stopped a sentence in. */
        const next = clips[ci + 1];
        if (next) eng.prepare(next);
      },
      progress(f) {
        if (my !== gen) return;
        const i = sentenceAt(clip, f, src.sentences);
        if (i !== state.index) set({ index: i });
      },
      ended() {
        if (my !== gen) return;
        if (ci + 1 < clips.length) start(ci + 1, 0);
        else stop();
      },
      failed(err) {
        if (my !== gen) return;
        set({ status: "error", error: err.message || "The voice stopped." });
      }
    });
  }

  function releaseEngine() {
    gen++;
    const e = engine;
    engine = null;
    clips = [];
    e?.release();
  }

  function play(source: ListenSource, next: PlaybackEngine, opts: PlayOptions) {
    releaseEngine();
    if (!source.sentences.length) {
      next.release();
      set(idleState(opts.rate, opts.following));
      return;
    }
    engine = next;
    clips = buildClips(source.sentences, next.maxChars);
    const from = Math.max(0, Math.min(source.sentences.length - 1, opts.from ?? 0));
    set({
      status: "loading",
      source,
      index: from,
      engine: next.id,
      label: next.label,
      rate: opts.rate,
      following: opts.following,
      error: null,
      spentChars: 0,
      spentCost: undefined
    });
    const ci = clipOf(from);
    start(ci, fractionOf(clips[ci], from, source.sentences));
  }

  function pause() {
    if (!engine || (state.status !== "playing" && state.status !== "loading")) return;
    engine.pause();
    set({ status: "paused" });
  }

  function resume() {
    const src = state.source;
    if (!engine || !src) return;
    if (state.status === "paused") {
      engine.resume();
      set({ status: "playing" });
    } else if (state.status === "error") {
      /* Retry picks up at the sentence it stopped on, not at the top: four
         paragraphs already heard are not worth hearing twice. */
      seek(state.index);
    }
  }

  function seek(sentence: number) {
    const src = state.source;
    if (!engine || !src) return;
    const target = Math.max(0, Math.min(src.sentences.length - 1, sentence));
    const ci = clipOf(target);
    start(ci, fractionOf(clips[ci], target, src.sentences));
  }

  function stop() {
    if (!engine && state.status === "idle") return;
    releaseEngine();
    set(idleState(state.rate, state.following));
  }

  return {
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getVersion: () => version,
    get: () => state,
    play,
    pause,
    resume,
    toggle() {
      if (state.status === "playing" || state.status === "loading") pause();
      else resume();
    },
    skip(delta) {
      seek(state.index + delta);
    },
    seek,
    setRate(rate) {
      if (rate === state.rate) return;
      engine?.setRate(rate);
      set({ rate });
    },
    setFollowing(on) {
      if (on !== state.following) set({ following: on });
    },
    swapEngine(next) {
      const src = state.source;
      if (!src || state.status === "idle") {
        next.release();
        return;
      }
      const at = state.index;
      const wasPaused = state.status === "paused";
      releaseEngine();
      engine = next;
      clips = buildClips(src.sentences, next.maxChars);
      set({ engine: next.id, label: next.label });
      seek(at);
      if (wasPaused) pause();
    },
    spend(source, chars, cost) {
      if (state.source !== source) return;
      set({
        spentChars: state.spentChars + chars,
        spentCost: cost == null ? state.spentCost : (state.spentCost ?? 0) + cost
      });
    },
    remaining() {
      const src = state.source;
      if (!src) return 0;
      let chars = 0;
      for (let i = state.index; i < src.sentences.length; i++) chars += src.sentences[i].length + 1;
      return secondsFor(chars, state.rate);
    },
    stop
  };
}

/** The one player. Everything that reads aloud goes through it, which is what
 *  makes starting a second reply stop the first. */
export const player = createPlayer();
