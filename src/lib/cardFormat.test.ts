/* ============================================================================
 * cardFormat.test.ts — the engine that normalises model output.
 *
 * Two properties matter more than any single case: it must be idempotent
 * (cards are re-normalised on every import and edit, so a compounding
 * transform would slowly destroy a deck) and it must be conservative (a wrong
 * rewrite of prose is worse than leaving it plain). Both are asserted here.
 * ========================================================================== */
import test from "node:test";
import assert from "node:assert/strict";
import { normaliseCardHtml } from "@/lib/cardFormat";

/** Every case below must survive a second pass unchanged. */
function stable(input: string): string {
  const once = normaliseCardHtml(input);
  assert.equal(normaliseCardHtml(once), once, "normalisation is not idempotent");
  return once;
}

/* ------------------------------------------------------------------ code -- */

test("a fenced code block becomes a shape block", () => {
  const out = stable("<p>Like this:</p>\n```python\nnp.dot(w, x) + b\n```");
  assert.match(out, /<div class="shape">np\.dot\(w, x\) \+ b<\/div>/);
  assert.ok(!out.includes("```"));
});

test("a fence with no language still works, and escapes its content", () => {
  const out = stable("```\nif (a < b) return a & b;\n```");
  assert.match(out, /<div class="shape">if \(a &lt; b\) return a &amp; b;<\/div>/);
});

test("inline backticks become code, escaped", () => {
  const out = stable("<p>The `x.shape` attribute, and `a < b`.</p>");
  assert.match(out, /<code>x\.shape<\/code>/);
  assert.match(out, /<code>a &lt; b<\/code>/);
});

test("a dollar inside code is not treated as maths", () => {
  const out = stable("<p>Run `echo $PATH` first.</p>");
  assert.match(out, /<code>echo \$PATH<\/code>/);
  assert.ok(!out.includes("$$"));
});

/* --------------------------------------------------------------- delimiters */

test("display delimiters become a formula block", () => {
  // \[…\] normalises to $$…$$, and a paragraph holding only display maths is
  // then promoted to the house formula block — both passes in one call.
  const out = stable("<p>\\[ E = mc^2 \\]</p>");
  assert.equal(out, '<div class="formula">E = mc^2</div>');
});

test("inline delimiters are normalised to single dollars", () => {
  const out = stable("<p>where \\(\\alpha\\) is the rate</p>");
  assert.ok(out.includes("$\\alpha$"), out);
});

/* ------------------------------------------------------------- bare LaTeX -- */

test("a bare command in prose gets wrapped", () => {
  const out = stable("<p>The cost uses \\frac{1}{2m} out front.</p>");
  assert.ok(out.includes("$\\frac{1}{2m}$"), out);
});

test("wrapping stops at ordinary prose rather than swallowing it", () => {
  const out = stable("<p>Here \\alpha is the learning rate.</p>");
  assert.ok(out.includes("$\\alpha$"), out);
  assert.ok(out.includes("is the learning rate"), out);
  assert.ok(!out.includes("learning rate$"), out);
});

test("an expression that continues through braces and operators is kept whole", () => {
  const out = stable("<p>\\sum_{i=0}^{m-1} x^{(i)} is the total.</p>");
  assert.ok(out.includes("$\\sum_{i=0}^{m-1} x^{(i)}$"), out);
  assert.ok(out.includes("is the total"), out);
});

test("already-delimited maths is left exactly as it is", () => {
  const src = "<p>Cost is $\\frac{1}{2m}$ times the sum.</p>";
  assert.equal(stable(src), src);
});

test("maths inside an existing code element is never wrapped", () => {
  const src = "<p>Write <code>\\frac{1}{2}</code> in LaTeX.</p>";
  assert.equal(stable(src), src);
});

/* ---------------------------------------------------------------- display -- */

test("a paragraph that is only display maths becomes a formula block", () => {
  const out = stable("<p>$$J(w,b) = \\frac{1}{2m}$$</p>");
  assert.equal(out, '<div class="formula">J(w,b) = \\frac{1}{2m}</div>');
});

test("display maths mixed into a sentence stays inline in the paragraph", () => {
  const out = stable("<p>The cost $$J$$ is a number.</p>");
  assert.ok(out.startsWith("<p>"), out);
  assert.ok(!out.includes("formula"), out);
});

/* ------------------------------------------------------------ left alone -- */

test("ordinary prose is untouched", () => {
  const src = "<p>The average of the squared gaps between prediction and truth.</p>";
  assert.equal(stable(src), src);
});

test("ASCII fractions are left alone rather than guessed at", () => {
  const src = "<p>It is right 2/3 of the time.</p>";
  assert.equal(stable(src), src);
});

test("existing house-style markup passes through unchanged", () => {
  const src =
    "<div class=\"formula\">J(w,b) = \\frac{1}{2m}</div><div class=\"shape\">np.dot(w, x)</div>";
  assert.equal(stable(src), src);
});

test("empty and null input are handled", () => {
  assert.equal(normaliseCardHtml(""), "");
  assert.equal(normaliseCardHtml(null), "");
  assert.equal(normaliseCardHtml(undefined), "");
});

/* --------------------------------------------------------------- the seed -- */

test("the shipped cost-function card round-trips unchanged", () => {
  const src =
    "<div class='formula'>J(w,b) = \\frac{1}{2m} \\sum_{i=0}^{m-1} \\left( f(x^{(i)}) - y^{(i)} \\right)^2</div>" +
    "<p>The average of the squared gaps between prediction and truth.</p>";
  assert.equal(stable(src), src);
});
