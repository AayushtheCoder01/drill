/* ============================================================================
 * thinking.test.ts — the three-state verdict, and the one state that is easy
 * to get wrong.
 *
 * Every control in the composer before this one was gated on the backend, and
 * a backend either supports a thing or it does not. Thinking introduced a
 * third answer — "we have not been told" — and the temptation is always to
 * round it down to "no", because that is one fewer branch and looks safe. It
 * is not safe: the catalogue only covers hosted models, so rounding down would
 * permanently grey out the switch for every local model, and for everybody at
 * all until the catalogue fetch lands.
 *
 * These lock that down. Pure: no DOM, no network, no stores — which is the
 * whole reason verdictFor takes the looked-up flag instead of doing the lookup.
 * ========================================================================== */
import test from "node:test";
import assert from "node:assert/strict";
import { verdictFor } from "@/lib/thinking";
import { ACTION_ORDER, CHAT_ACTIONS, availability } from "@/lib/chatActions";

test("a model the catalogue vouches for is usable", () => {
  const v = verdictFor("anthropic/claude-sonnet-4.5", true);
  assert.equal(v.verdict, "yes");
  assert.equal(v.usable, true);
});

test("a model the catalogue rules out is refused, by name", () => {
  const v = verdictFor("meta-llama/llama-3.3-70b-instruct", false);
  assert.equal(v.verdict, "no");
  assert.equal(v.usable, false);
  /* The reason has to name the model. "Not supported" on a disabled button is
     the grey-button problem: it says no without saying what to change. */
  assert.match(v.why, /llama-3\.3-70b-instruct/);
  /* And without the vendor prefix, which is noise in a sentence about one
     model. */
  assert.doesNotMatch(v.why, /meta-llama\//);
});

test("not knowing leaves the switch live", () => {
  const v = verdictFor("qwen3:8b", undefined);
  assert.equal(v.verdict, "unknown");
  assert.equal(v.usable, true, "an unlisted model must not be locked out of thinking");
  assert.match(v.why, /not sure/i);
});

test("no model at all is not a verdict about a model", () => {
  const v = verdictFor("", undefined);
  assert.equal(v.usable, false);
  assert.doesNotMatch(v.why, /does not support/);
});

test("the backend gate is checked before the model is", () => {
  /* Ollama cannot search the web, and no model changes that. A model-level
     question must never be asked — let alone answered — for a capability the
     backend does not have at all. */
  const av = availability("web", ["think"], "anything/at-all");
  assert.equal(av.can, false);
  assert.equal(av.certain, true);
  assert.equal(av.why, CHAT_ACTIONS.web.unsupported);
});

test("an action with no model gate is available on any model its backend allows", () => {
  const av = availability("web", ["web"], "some/obscure-model");
  assert.equal(av.can, true);
  assert.equal(av.certain, true);
});

test("every action explains itself in both directions", () => {
  /* A registry entry with an empty `unsupported` produces a disabled control
     with an empty tooltip, which is exactly the dead dial this file exists to
     prevent — just greyed out instead of silent. */
  for (const id of ACTION_ORDER) {
    const a = CHAT_ACTIONS[id];
    assert.ok(a.blurb.trim().length > 10, `${id} has no blurb`);
    assert.ok(a.unsupported.trim().length > 10, `${id} does not say why it is unavailable`);
  }
});
