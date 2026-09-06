/* ============================================================================
 * title.test.ts — the two halves of naming a thread without a second chance.
 *
 * These exist because auto-titling asked a model for a name with a 24-token
 * cap, a reasoning model spent all 24 tokens thinking, nothing came back, and
 * the conversation stayed untitled — so the next message asked again. One
 * direct message looked like two requests, permanently. cleanTitle has to
 * salvage what a reasoning model does send; localTitle has to make the retry
 * pointless by producing a usable name with no model at all. Pure: no DOM, no
 * stores, no key.
 * ========================================================================== */
import test from "node:test";
import assert from "node:assert/strict";
import { cleanTitle, localTitle } from "@/lib/title";

test("cleanTitle takes the title after a closed scratchpad", () => {
  assert.equal(cleanTitle("<think>They asked about gradients. Short title.</think>\nGradient descent basics"), "Gradient descent basics");
});

test("cleanTitle refuses a scratchpad that never closed", () => {
  /* The cap was hit mid-reasoning: there is no title in there, and keeping the
     tail would name the thread after half a sentence of the model's thinking. */
  assert.equal(cleanTitle("<think>Okay, the user wants a title. The conversation is about"), "");
  assert.equal(cleanTitle(""), "");
  assert.equal(cleanTitle("   \n  "), "");
});

test("cleanTitle strips the wrappers models add anyway", () => {
  assert.equal(cleanTitle('"Backprop chain rule"'), "Backprop chain rule");
  assert.equal(cleanTitle("Title: Eigenvalue intuition"), "Eigenvalue intuition");
  assert.equal(cleanTitle("**Softmax temperature**"), "Softmax temperature");
  assert.equal(cleanTitle("```\nAdam optimiser\n```"), "Adam optimiser");
  assert.equal(cleanTitle("Bias variance tradeoff.\nHope that helps!"), "Bias variance tradeoff");
});

test("localTitle names the thread from the opening message", () => {
  assert.equal(localTitle("explain how backpropagation works in a small network"), "How backpropagation works");
  assert.equal(localTitle("Why does dropout help generalisation? I keep forgetting."), "Why does dropout help generalisation");
});

test("localTitle drops the greeting rather than being named after it", () => {
  assert.equal(localTitle("hey can you explain eigenvectors"), "Eigenvectors");
  assert.equal(localTitle("what is a Kalman filter"), "A Kalman filter");
});

test("localTitle survives markdown, maths and code", () => {
  assert.equal(localTitle("```python\nprint(1)\n```\nwhat does this print"), "What does this print");
  assert.equal(localTitle("## Softmax\n$$e^x$$ derivation"), "Softmax derivation");
});

test("localTitle returns nothing when there is nothing to name", () => {
  /* An attachment sent with no text. The caller keeps the placeholder — what
     it must not do is treat this as a reason to ask a model again. */
  assert.equal(localTitle(""), "");
  assert.equal(localTitle("   "), "");
});

test("localTitle never ends on punctuation or runs long", () => {
  const long = localTitle("describe the entire history of convolutional neural network architectures in detail");
  assert.ok(long.length <= 60, long);
  assert.doesNotMatch(long, /[.,;:!?\s-]$/, long);
});
