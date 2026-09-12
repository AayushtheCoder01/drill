/* ============================================================================
 * words.test.ts — a reply has to sound like something before it can be heard.
 *
 * The maths cases carry the most weight. Every reply in this app is about ML,
 * and LaTeX handed to a voice as written is "backslash frac brace one": the
 * listener loses the one part of the explanation they could not have guessed.
 * The notation below is the notation replies actually use — sums over the
 * training set, the i-th example in brackets, gradients, norms, transposes.
 *
 * The sentence and chunk cases guard two limits that are hard ones rather
 * than taste: Groq refuses more than 200 characters in one request, and
 * Chrome's own voice stops mid-word after about fifteen seconds of speech.
 * ========================================================================== */
import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_SPOKEN,
  codeCue,
  finishSentence,
  planChunks,
  secondsFor,
  sentenceSpans,
  speakable,
  splitSpoken,
  texToWords
} from "@/lib/speech/words";

/* ------------------------------------------------------------------ maths -- */

test("fractions read as 'over', and a compound numerator is announced", () => {
  assert.equal(texToWords("\\frac{1}{2m}"), "1 over 2 m");
  /* Said flat, "a plus b over c" is a + b/c. */
  assert.equal(texToWords("\\frac{a+b}{c}"), "the fraction a plus b, over c");
  assert.equal(texToWords("\\frac{\\partial L}{\\partial w}"), "partial L over partial w");
});

test("subscripts, powers and the i-th example", () => {
  assert.equal(texToWords("x_i^2"), "x sub i squared");
  assert.equal(texToWords("x^3"), "x cubed");
  assert.equal(texToWords("e^{-z}"), "e to the minus z");
  /* x^{(i)} is the i-th training example in every ML course, not a power. */
  assert.equal(texToWords("x^{(i)}"), "x superscript i");
  assert.equal(texToWords("A^{-1}"), "A inverse");
  assert.equal(texToWords("X^T"), "X transpose");
  assert.equal(texToWords("X^\\top"), "X transpose");
  assert.equal(texToWords("(a+b)^2"), "the quantity a plus b, squared");
});

test("big operators take their limits", () => {
  assert.equal(texToWords("\\sum_{i=1}^{m} x_i"), "the sum from i equals 1 to m of x sub i");
  assert.equal(texToWords("\\lim_{x \\to 0} f(x)"), "the limit as x goes to 0 of f of x");
  assert.equal(texToWords("\\nabla_\\theta J"), "the gradient with respect to theta of J");
  assert.equal(texToWords("\\operatorname*{arg\\,max}_w J(w)"), "the arg max over w of J of w");
});

test("functions, conditioning, norms and sets", () => {
  assert.equal(texToWords("\\sigma(z) = \\frac{1}{1 + e^{-z}}"), "sigma of z equals 1 over 1 plus e to the minus z");
  assert.equal(texToWords("p(y \\mid x)"), "p of y given x");
  assert.equal(texToWords("p(y|x)"), "p of y given x");
  assert.equal(texToWords("\\|w\\|_2^2"), "the norm of w sub 2 squared");
  assert.equal(texToWords("x \\in \\mathbb{R}^{d}"), "x in R d");
  assert.equal(texToWords("\\mathbb{E}[X]"), "E of X");
  assert.equal(texToWords("\\sqrt{d_k}"), "the square root of d sub k");
  assert.equal(texToWords("\\hat{y}"), "y hat");
});

test("a matrix is named rather than read cell by cell", () => {
  assert.equal(texToWords("\\begin{bmatrix} 1 & 2 \\\\ 3 & 4 \\end{bmatrix}"), "a matrix");
});

test("anything unknown degrades to words, never to punctuation or a throw", () => {
  assert.equal(texToWords("\\softmax"), "softmax");
  assert.equal(texToWords(""), "");
  for (const junk of ["}}}^_", "\\frac{", "\\begin{cases", "\\left(", "|||", "\\\\\\"]) {
    assert.doesNotThrow(() => texToWords(junk), `threw on ${junk}`);
    assert.doesNotMatch(texToWords(junk), /[\\{}^_]/, `left markup in the words for ${junk}`);
  }
});

/* ------------------------------------------------------------------ prose -- */

test("abbreviations and symbols are spelled out", () => {
  assert.equal(speakable("Use e.g. the chain rule, i.e. differentiate."), "Use for example the chain rule, that is differentiate.");
  assert.equal(speakable("x → y"), "x to y");
  assert.equal(speakable("α = 0.01"), "alpha equals 0.01");
  assert.equal(speakable("x² and y₁"), "x squared and y sub 1");
});

test("links are named, not spelled; emoji and markdown leftovers go", () => {
  assert.equal(speakable("See https://example.com/a?b=1 for more"), "See a link for more");
  assert.equal(speakable("Great 🎉 work"), "Great work");
  assert.equal(speakable("x_train is **bold**"), "x train is bold");
});

test("a heading gets the full stop that gives it a pause", () => {
  assert.equal(finishSentence("Gradient descent"), "Gradient descent.");
  assert.equal(finishSentence("Done!"), "Done!");
  assert.equal(finishSentence("It is (roughly)."), "It is (roughly).");
  /* A table row is read across with commas between cells; its last comma is
     not a pause, and ",." is what a voice would stumble on. */
  assert.equal(finishSentence("Adam, yes, "), "Adam, yes.");
});

test("code is announced, not read", () => {
  assert.equal(codeCue("python"), "Python code, skipped.");
  assert.equal(codeCue("py"), "Python code, skipped.");
  assert.equal(codeCue(""), "A code block, skipped.");
  assert.equal(codeCue("haskell"), "Haskell code, skipped.");
});

/* -------------------------------------------------------------- sentences -- */

function pieces(text: string): string[] {
  return sentenceSpans(text).map((s) => text.slice(s.start, s.end));
}

test("sentences split where a reader would, not at every full stop", () => {
  assert.deepEqual(pieces("Use e.g. the chain rule. Pi is 3.14 here. Done!"), [
    "Use e.g. the chain rule.",
    "Pi is 3.14 here.",
    "Done!"
  ]);
  assert.deepEqual(pieces("See Fig. 2 for details. Then go."), ["See Fig. 2 for details.", "Then go."]);
});

test("spans are trimmed, and a span with nothing to say is dropped", () => {
  assert.deepEqual(pieces("  Leading space.   Two.  "), ["Leading space.", "Two."]);
  assert.deepEqual(pieces("..."), []);
  /* The maths placeholder counts as content: a sentence can be one formula. */
  assert.deepEqual(pieces("The loss \uFFFC is convex. Next one."), ["The loss \uFFFC is convex.", "Next one."]);
});

test("a long sentence is cut at a clause, and never past the limit", () => {
  const long =
    "Gradient descent moves the weights a small step against the gradient, which is the direction of steepest increase, " +
    "and repeating that step many times walks the loss downhill, although the size of each step decides whether it " +
    "converges smoothly, oscillates, or diverges entirely when the learning rate is too large.";
  const out = splitSpoken(long);
  assert.ok(out.length > 1);
  for (const p of out) assert.ok(p.length <= MAX_SPOKEN, `piece of ${p.length} characters`);
  assert.equal(out.join(" ").replace(/\s+/g, " "), long.replace(/\s+/g, " "));
  assert.match(out[0], /,$/, "expected the first cut to land on a clause");

  const unbroken = "x".repeat(450);
  assert.deepEqual(splitSpoken(unbroken).map((p) => p.length), [200, 200, 50]);
  assert.deepEqual(splitSpoken("Short."), ["Short."]);
});

/* ----------------------------------------------------------------- chunks -- */

test("chunks stay under the limit, and the first one is small", () => {
  assert.deepEqual(planChunks([50, 50, 50, 300, 50], 200), [[0, 1, 2], [3], [4]]);
  /* The first request is kept short so the voice starts in about a second. */
  assert.deepEqual(planChunks([100, 100, 100, 100], 1000), [[0, 1], [2, 3]]);
});

test("a browser voice gets one sentence per clip", () => {
  assert.deepEqual(planChunks([10, 10, 10], 0), [[0], [1], [2]]);
  assert.deepEqual(planChunks([], 800), []);
});

test("time left is an estimate that scales with speed", () => {
  assert.equal(secondsFor(150, 1), 10);
  assert.equal(secondsFor(150, 2), 5);
  assert.equal(secondsFor(-5, 1), 0);
});
