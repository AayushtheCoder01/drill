/* ============================================================================
 * memoryDedup.test.ts — the junk-drawer guard, asserted.
 *
 * Saving from chat makes it cheap to save the same thing repeatedly, so these
 * are the properties that stop it: identical text never becomes a second row,
 * a restatement offers to replace rather than accumulate, and an unrelated
 * fact is still allowed through. Pure — no DOM, no IndexedDB, no key.
 * ========================================================================== */
import test from "node:test";
import assert from "node:assert/strict";
import { extractKeywords } from "@/lib/memoryRetrieval";
import { GLOBAL_CAP, classify, globalAtCap } from "@/lib/memoryDedup";
import type { Memory, MemoryScope } from "@/types";

const NOW = Date.UTC(2026, 0, 1);

let seq = 0;
function mem(text: string, patch: Partial<Memory> = {}): Memory {
  return {
    id: patch.id ?? `m${++seq}`,
    scope: patch.scope ?? "project",
    projectId: patch.projectId ?? "p1",
    type: patch.type ?? "understanding",
    text,
    keywords: patch.keywords ?? extractKeywords(text),
    created: NOW,
    updatedAt: NOW,
    useCount: 0,
    lastUsed: null,
    pinned: false,
    active: patch.active ?? true,
    supersededBy: null,
    source: "manual",
    origin: null
  };
}

/* ------------------------------------------------------------- classify -- */

test("identical text is a duplicate, not a new row", () => {
  const t = "Thinks of attention as a soft dictionary lookup rather than focus";
  const v = classify(t, [mem(t)]);
  assert.equal(v.kind, "duplicate");
  assert.equal(v.similarity, 1);
});

test("an unrelated fact is new", () => {
  const pool = [mem("Prefers worked examples before the formal definition")];
  const v = classify("Runs experiments on a rented A100 over SSH", pool);
  assert.equal(v.kind, "new");
  assert.equal(v.existing, null);
});

test("a restatement of the same fact offers a merge, naming what it replaces", () => {
  const pool = [mem("Thinks of attention as a soft dictionary lookup")];
  const v = classify("Understands attention as a soft dictionary lookup over keys", pool);
  assert.equal(v.kind, "merge");
  assert.equal(v.existing, pool[0]);
});

test("the closest memory wins, not the first scanned", () => {
  const near = mem("Confused by why attention scales by the square root of d_k");
  const pool = [mem("Prefers geometric intuition to algebra"), near, mem("Uses PyTorch, not JAX")];
  const v = classify("Still unsure why attention scales by the square root of d_k", pool);
  assert.equal(v.existing, near);
});

test("retired memories never suppress a restatement", () => {
  /* The bug this guards: a deliberately-retired memory blocking the corrected
     version of the same fact from ever being proposed again. */
  const t = "Believes softmax temperature and attention scaling are the same knob";
  const v = classify(t, [mem(t, { active: false })]);
  assert.equal(v.kind, "new");
});

test("an empty pool is new, and does not divide by zero", () => {
  const v = classify("Anything at all", []);
  assert.equal(v.kind, "new");
  assert.equal(v.similarity, 0);
});

test("text with no extractable keywords never falsely matches", () => {
  const v = classify("the and of a", [mem("Gradient descent needs a learning rate")]);
  assert.equal(v.kind, "new");
  assert.equal(v.similarity, 0);
});

test("similarity is symmetric regardless of which side is longer", () => {
  const short = "Uses PyTorch";
  const long = "Uses PyTorch for every experiment and refuses to switch to JAX";
  const a = classify(short, [mem(long)]).similarity;
  const b = classify(long, [mem(short)]).similarity;
  assert.equal(a, b);
});

test("stored keywords are used when present, so tokenisation cannot drift", () => {
  const m = mem("placeholder", { keywords: ["attention", "softmax", "scaling"] });
  const v = classify("attention softmax scaling", [m]);
  assert.equal(v.kind, "duplicate");
});

test("a pending candidate counts as already-seen, though it is not a Memory yet", () => {
  /* Found in the browser: asking to save twice before reviewing the tray
     queued two identical candidates, because the pool only held committed
     memory. classify takes anything with text for exactly this reason. */
  const queued = [{ id: "c1", text: "Thinks of attention as a soft dictionary lookup rather than as focus" }];
  const v = classify("Thinks of attention as a soft dictionary lookup rather than as focus", queued);
  assert.equal(v.kind, "duplicate");
  assert.equal(v.existing?.id, "c1");
});

test("a target with no active flag is treated as live", () => {
  const v = classify("gradient descent learning rate", [{ id: "c1", text: "gradient descent learning rate" }]);
  assert.equal(v.kind, "duplicate");
});

/* ------------------------------------------------------------------ cap -- */

test("the global cap counts only active global memories", () => {
  const scope: MemoryScope = "global";
  const under = Array.from({ length: GLOBAL_CAP - 1 }, (_, i) => mem(`global fact ${i}`, { scope }));
  assert.equal(globalAtCap(under), false);

  const retired = [...under, mem("one more", { scope, active: false })];
  assert.equal(globalAtCap(retired), false, "a retired entry does not count toward the cap");

  assert.equal(globalAtCap([...under, mem("one more", { scope })]), true);
});

test("project memory does not count toward the global cap", () => {
  const pool = Array.from({ length: GLOBAL_CAP + 5 }, (_, i) => mem(`project fact ${i}`));
  assert.equal(globalAtCap(pool), false);
});
