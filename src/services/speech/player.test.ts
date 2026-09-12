/* ============================================================================
 * player.test.ts — the reading queue, with no voice attached.
 *
 * The engines here are fakes that record what they were asked and fire their
 * events only when a test says so. That is the point of the player taking its
 * engine as an argument: what happens when a clip ends, when a clip fails
 * halfway, when skip is pressed while the previous clip's `ended` is still on
 * its way — none of that needs a speaker to be true, and all of it has been
 * wrong at some point in every audio player ever written.
 * ========================================================================== */
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildClips,
  createPlayer,
  fractionOf,
  sentenceAt,
  type Clip,
  type EngineEvents,
  type ListenSource,
  type PlaybackEngine
} from "@/services/speech/player";

class FakeEngine implements PlaybackEngine {
  readonly id = "openrouter" as const;
  readonly label = "Fake voice";
  plays: { clip: Clip; from: number; rate: number; ev: EngineEvents }[] = [];
  prepared: Clip[] = [];
  paused = 0;
  resumed = 0;
  released = 0;
  rate = 1;
  constructor(readonly maxChars: number) {}
  play(clip: Clip, from: number, rate: number, ev: EngineEvents) {
    this.plays.push({ clip, from, rate, ev });
  }
  prepare(clip: Clip) {
    this.prepared.push(clip);
  }
  pause() {
    this.paused++;
  }
  resume() {
    this.resumed++;
  }
  setRate(rate: number) {
    this.rate = rate;
  }
  release() {
    this.released++;
  }
  get last() {
    return this.plays[this.plays.length - 1];
  }
}

function source(sentences: string[]): ListenSource {
  return { conversationId: "c1", projectId: "p1", turnId: "t1", variant: 0, title: "A reply", sentences };
}

const SIX = ["One.", "Two two.", "Three three three.", "Four.", "Five five.", "Six."];

test("a reply plays clip after clip, and fetches only one ahead", () => {
  const p = createPlayer();
  const e = new FakeEngine(0);
  p.play(source(SIX.slice(0, 3)), e, { rate: 1, following: true });

  assert.equal(p.get().status, "loading");
  assert.equal(e.plays.length, 1);
  assert.equal(e.prepared.length, 0, "nothing is fetched ahead before anything is heard");

  e.last.ev.started();
  assert.equal(p.get().status, "playing");
  assert.deepEqual(
    e.prepared.map((c) => c.first),
    [1],
    "exactly the next clip, once the first is sounding"
  );

  e.last.ev.ended();
  assert.equal(e.plays.length, 2);
  assert.equal(p.get().index, 1);
  e.last.ev.started();
  e.last.ev.ended();
  e.last.ev.started();
  e.last.ev.ended();

  assert.equal(p.get().status, "idle");
  assert.equal(p.get().source, null);
  assert.equal(e.released, 1, "finishing lets go of the engine");
});

test("progress through a multi-sentence clip moves the highlighted sentence", () => {
  const p = createPlayer();
  const e = new FakeEngine(1000);
  p.play(source(SIX), e, { rate: 1, following: true });
  const clip = e.last.clip;
  assert.equal(clip.first, 0);
  e.last.ev.started();
  e.last.ev.progress(fractionOf(clip, 2, SIX) + 0.01);
  assert.equal(p.get().index, 2);
});

test("clip arithmetic agrees with itself", () => {
  const clips = buildClips(SIX, 1000);
  for (const clip of clips) {
    for (let i = clip.first; i <= clip.last; i++) {
      assert.equal(sentenceAt(clip, fractionOf(clip, i, SIX), SIX), i, `sentence ${i} did not round-trip`);
    }
  }
});

test("pause and resume go to the engine, and status follows", () => {
  const p = createPlayer();
  const e = new FakeEngine(0);
  p.play(source(SIX), e, { rate: 1, following: true });
  e.last.ev.started();
  p.pause();
  assert.equal(p.get().status, "paused");
  assert.equal(e.paused, 1);
  p.toggle();
  assert.equal(p.get().status, "playing");
  assert.equal(e.resumed, 1);
});

test("skip moves by sentence and stops at both ends", () => {
  const p = createPlayer();
  const e = new FakeEngine(0);
  p.play(source(SIX), e, { rate: 1, following: true });
  p.skip(2);
  assert.equal(p.get().index, 2);
  assert.equal(e.last.clip.first, 2);
  p.skip(-10);
  assert.equal(p.get().index, 0);
  p.skip(99);
  assert.equal(p.get().index, 5);
});

test("a late event from a skipped clip changes nothing", () => {
  const p = createPlayer();
  const e = new FakeEngine(0);
  p.play(source(SIX), e, { rate: 1, following: true });
  const stale = e.last.ev;
  p.skip(1);
  const plays = e.plays.length;
  /* The browser reports the cancelled utterance as ended. If this were
     believed, the player would advance again: skip once, move twice. */
  stale.ended();
  stale.failed(new Error("interrupted"));
  assert.equal(e.plays.length, plays);
  assert.equal(p.get().index, 1);
  assert.equal(p.get().status, "loading");
});

test("a failure keeps its place, and retry picks up at that sentence", () => {
  const p = createPlayer();
  const e = new FakeEngine(0);
  p.play(source(SIX), e, { rate: 1, following: true });
  e.last.ev.started();
  e.last.ev.ended();
  e.last.ev.started();
  e.last.ev.failed(new Error("OpenRouter 429"));
  assert.equal(p.get().status, "error");
  assert.equal(p.get().error, "OpenRouter 429");
  assert.equal(p.get().index, 1);

  p.resume();
  assert.equal(p.get().status, "loading");
  assert.equal(e.last.clip.first, 1, "retried from the sentence it stopped on");
});

test("starting a new reply releases the old engine and resets the spend", () => {
  const p = createPlayer();
  const a = new FakeEngine(0);
  const first = source(SIX);
  p.play(first, a, { rate: 1, following: true });
  p.spend(first, 120, 0.0005);
  assert.equal(p.get().spentChars, 120);

  const b = new FakeEngine(0);
  const second = { ...source(["Hello."]), turnId: "t2" };
  p.play(second, b, { rate: 1.5, following: false });
  assert.equal(a.released, 1);
  assert.equal(p.get().spentChars, 0);
  assert.equal(p.get().rate, 1.5);

  /* Money spent on the first reply's audio arriving late is not this one's. */
  p.spend(first, 50, 0.0002);
  assert.equal(p.get().spentChars, 0);
  p.spend(second, 10, undefined);
  assert.equal(p.get().spentChars, 10);
  assert.equal(p.get().spentCost, undefined, "unknown cost stays unknown, never zero");
});

test("starting from a selected sentence", () => {
  const p = createPlayer();
  const e = new FakeEngine(1000);
  p.play(source(SIX), e, { rate: 1, following: true, from: 3 });
  assert.equal(p.get().index, 3);
  assert.ok(e.last.from > 0, "the clip starts part-way in, not at its first sentence");
  assert.equal(sentenceAt(e.last.clip, e.last.from, SIX), 3);
});

test("stop releases everything, and stopping twice is harmless", () => {
  const p = createPlayer();
  const e = new FakeEngine(0);
  p.play(source(SIX), e, { rate: 1, following: true });
  p.stop();
  assert.equal(p.get().status, "idle");
  assert.equal(e.released, 1);
  const v = p.getVersion();
  p.stop();
  assert.equal(p.getVersion(), v, "stopping an idle player must not wake every subscriber");
});

test("a new voice mid-reading carries on from the same sentence", () => {
  const p = createPlayer();
  const a = new FakeEngine(0);
  p.play(source(SIX), a, { rate: 1, following: true });
  p.skip(3);
  const b = new FakeEngine(1000);
  p.swapEngine(b);
  assert.equal(a.released, 1);
  assert.equal(p.get().index, 3);
  assert.equal(sentenceAt(b.last.clip, b.last.from, SIX), 3);
});

test("speed reaches the engine and survives into the next clip", () => {
  const p = createPlayer();
  const e = new FakeEngine(0);
  p.play(source(SIX), e, { rate: 1, following: true });
  p.setRate(1.75);
  assert.equal(e.rate, 1.75);
  e.last.ev.started();
  e.last.ev.ended();
  assert.equal(e.last.rate, 1.75);
  assert.ok(p.remaining() > 0);
});

test("an empty reply never starts", () => {
  const p = createPlayer();
  const e = new FakeEngine(0);
  p.play(source([]), e, { rate: 1, following: true });
  assert.equal(p.get().status, "idle");
  assert.equal(e.plays.length, 0);
  assert.equal(e.released, 1);
});
