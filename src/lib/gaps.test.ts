/* ============================================================================
 * gaps.test.ts — the diagnosis has to survive being clustered.
 *
 * This output goes into the system prompt of every AI call in the app: the
 * card writer aims at it, the marker checks against it, the exam generator
 * tests it, the tutor teaches it. So the failure modes worth pinning down are
 * the ones that would quietly poison all of them at once — merging two
 * different confusions into one, keeping a gap that has stopped happening,
 * or promoting a single bad evening to a standing fact about somebody.
 * ========================================================================== */
import test from "node:test";
import assert from "node:assert/strict";
import { gapsFrom, renderGaps } from "@/lib/gaps";
import { DAY } from "@/lib/util";
import type { LogEntry } from "@/types";

function entry(missing: string[], opts: { daysAgo?: number; card?: string } = {}): LogEntry {
  return {
    t: Date.now() - (opts.daysAgo ?? 1) * DAY,
    g: 1,
    s: "review",
    d: "deck1",
    c: opts.card ?? "card1",
    m: missing
  };
}

test("the same confusion, phrased differently, is one gap", () => {
  /* The exam rail matched these by exact string, which put them in three
     buckets and reported nothing as recurring. */
  const gaps = gapsFrom([
    entry(["the ordering the chain rule gives"], { card: "a" }),
    entry(["chain rule ordering"], { card: "b" }),
    entry(["ordering in the chain rule"], { card: "c" })
  ]);
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].n, 3);
  assert.equal(gaps[0].cards, 3);
});

test("different confusions stay apart", () => {
  const gaps = gapsFrom([
    entry(["chain rule ordering"], { card: "a" }),
    entry(["chain rule ordering"], { card: "b" }),
    entry(["product rule ordering"], { card: "c" }),
    entry(["product rule ordering"], { card: "d" })
  ]);
  assert.equal(gaps.length, 2, "sharing one word is not sharing a confusion");
  assert.deepEqual(
    gaps.map((g) => g.n),
    [2, 2]
  );
});

test("a gap that stopped recurring stops being reported", () => {
  /* Derived rather than remembered precisely so this happens for free. A
     confusion cleared up two months ago is not something to keep telling a
     model about. */
  const gaps = gapsFrom([
    entry(["chain rule ordering"], { daysAgo: 60 }),
    entry(["chain rule ordering"], { daysAgo: 55 }),
    entry(["chain rule ordering"], { daysAgo: 50 })
  ]);
  assert.equal(gaps.length, 0);
});

test("one bad evening is not a standing fact about somebody", () => {
  const once = gapsFrom([entry(["mixed up the axis argument"])]);
  assert.equal(once.length, 0, "a single occurrence is noise");
  const twice = gapsFrom([entry(["mixed up the axis argument"]), entry(["mixed up the axis argument"])]);
  assert.equal(twice.length, 1);
});

test("a concept gap outranks a stubborn card", () => {
  /* Three cards showing the same confusion is a thing they have not
     understood; the same card three times may just be a badly written card.
     The counts are equal here, so the tie-break is what is being tested. */
  const gaps = gapsFrom([
    entry(["softmax temperature scaling"], { card: "a" }),
    entry(["softmax temperature scaling"], { card: "b" }),
    entry(["softmax temperature scaling"], { card: "c" }),
    entry(["broadcasting rules for numpy"], { card: "z" }),
    entry(["broadcasting rules for numpy"], { card: "z" }),
    entry(["broadcasting rules for numpy"], { card: "z" })
  ]);
  assert.equal(gaps.length, 2);
  assert.equal(gaps[0].cards, 3);
  assert.equal(gaps[1].cards, 1);
});

test("the label is the phrasing the marker actually reached for most", () => {
  const gaps = gapsFrom([
    entry(["chain rule ordering"], { card: "a" }),
    entry(["chain rule ordering"], { card: "b" }),
    entry(["the specific ordering that the chain rule imposes here"], { card: "c" })
  ]);
  assert.equal(gaps[0].text, "chain rule ordering");
});

test("entries with no diagnosis are skipped rather than counted", () => {
  /* Every grade writes a log entry; only marked recall attempts carry `m`. */
  const gaps = gapsFrom([
    { t: Date.now() - DAY, g: 3, s: "review", d: "deck1", c: "a" },
    { t: Date.now() - DAY, g: 1, s: "review", d: "deck1", c: "b", m: [] },
    entry(["notation for the index"], { card: "c" }),
    entry(["notation for the index"], { card: "d" })
  ]);
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].n, 2);
});

test("a one-word confusion still clusters", () => {
  /* "notation" is a real thing to keep missing, and requiring two shared
     words would make every short phrase its own gap forever. */
  const gaps = gapsFrom([entry(["notation"], { card: "a" }), entry(["notation"], { card: "b" })]);
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].n, 2);
});

test("output is capped and ordered by how much it is costing them", () => {
  const entries: LogEntry[] = [];
  for (let i = 0; i < 8; i++) {
    /* i + 2 occurrences of gap i, so the later ones are the bigger ones. */
    for (let k = 0; k < i + 2; k++) entries.push(entry([`confusion number ${i} about topic${i}`], { card: "c" + k }));
  }
  const gaps = gapsFrom(entries, { limit: 3 });
  assert.equal(gaps.length, 3);
  assert.ok(gaps[0].n > gaps[1].n && gaps[1].n > gaps[2].n);
  assert.equal(gaps[0].n, 9, "the worst one first");
});

test("nothing to say says nothing", () => {
  assert.deepEqual(gapsFrom([]), []);
  assert.equal(renderGaps([]), "");
});

test("a rendered gap says how often and across how many cards", () => {
  const line = renderGaps(gapsFrom([entry(["chain rule ordering"], { card: "a" }), entry(["chain rule ordering"], { card: "b" })]));
  assert.match(line, /chain rule ordering/);
  assert.match(line, /missed 2×/);
  assert.match(line, /2 different cards/, "the count of cards is what separates a concept gap from a bad card");
});

test("one card is not described as several", () => {
  const line = renderGaps(gapsFrom([entry(["axis argument"], { card: "a" }), entry(["axis argument"], { card: "a" })]));
  assert.doesNotMatch(line, /different cards/);
});
