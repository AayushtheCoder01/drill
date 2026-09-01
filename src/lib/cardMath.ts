/* ============================================================================
 * cardMath.ts — real typeset maths on flashcards.
 *
 * Cards are HTML, not markdown, so this is deliberately not lib/markdown.ts:
 * that file pulls in marked and highlight.js as well as KaTeX (~450KB) and the
 * review loop — the thing you open every day — must not pay for them.
 *
 * Two rules make this safe and cheap:
 *
 *   1. KaTeX is loaded with a dynamic import, so it becomes its own chunk and
 *      only downloads once a card that actually contains maths is rendered.
 *      A deck with no maths never fetches it.
 *
 *   2. Nothing is ever spliced into an HTML string. `katex.render` writes into
 *      a real element, and the surrounding text is rebuilt as text nodes — so
 *      a stray `$` in an attribute value or a code sample cannot break out of
 *      where it sits. Same reason markdown.ts walks the DOM in restoreMath.
 *
 * Authors write `$...$` for inline maths and `$$...$$` for a displayed one;
 * a <div class="formula"> containing bare LaTeX is treated as displayed
 * without needing the dollars. See public/decks/README.md.
 * ========================================================================== */

/** Anything that looks like it wants typesetting. Deliberately loose — the
 *  cost of a false positive is one wasted scan, the cost of a false negative
 *  is a card that renders its own source at the learner. */
const MATH_RE = /\$[^$\n]|\\[a-zA-Z]+|class=["']formula["']/;

export function hasMath(html: string): boolean {
  return MATH_RE.test(html);
}

/** Loaded at most once, and only when a card needs it. */
let katexPromise: Promise<typeof import("katex")> | null = null;
function loadKatex(): Promise<typeof import("katex")> {
  if (!katexPromise) {
    katexPromise = Promise.all([import("katex"), import("katex/dist/katex.min.css")]).then(([k]) => k);
  }
  return katexPromise;
}

/** Text inside these is source, not prose — a `$` there is a dollar sign. */
function inLiteral(node: Node): boolean {
  for (let el = node.parentElement; el; el = el.parentElement) {
    const tag = el.tagName;
    if (tag === "CODE" || tag === "PRE" || tag === "TEXTAREA") return true;
    if (el.classList.contains("katex") || el.classList.contains("shape")) return true;
  }
  return false;
}

type Katex = typeof import("katex");

/** Render one expression into a fresh element. A malformed expression shows
 *  as its own source in a code chip rather than throwing away the card. */
function renderInto(katex: Katex, tex: string, display: boolean): HTMLElement {
  const el = document.createElement(display ? "div" : "span");
  if (display) el.className = "math-display";
  try {
    katex.default.render(tex, el, { displayMode: display, throwOnError: true, strict: false, output: "html" });
  } catch {
    el.textContent = display ? `$$${tex}$$` : `$${tex}$`;
    el.className = display ? "math-display math-bad" : "math-bad";
  }
  return el;
}

const SPLIT_RE = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g;

/** Replace the maths in one text node with rendered nodes, leaving the prose
 *  around it as text nodes. Returns true if anything changed. */
function typesetTextNode(katex: Katex, node: Text): boolean {
  const src = node.nodeValue || "";
  if (!src.includes("$")) return false;

  const parts = src.split(SPLIT_RE);
  if (parts.length < 2) return false;

  const frag = document.createDocumentFragment();
  let changed = false;
  for (const part of parts) {
    if (!part) continue;
    const display = part.startsWith("$$") && part.endsWith("$$") && part.length > 4;
    const inline = !display && part.startsWith("$") && part.endsWith("$") && part.length > 2;
    if (display || inline) {
      const tex = display ? part.slice(2, -2) : part.slice(1, -1);
      frag.appendChild(renderInto(katex, tex.trim(), display));
      changed = true;
    } else {
      frag.appendChild(document.createTextNode(part));
    }
  }
  if (changed) node.replaceWith(frag);
  return changed;
}

/**
 * Typeset every expression under `root`, in place.
 *
 * Safe to call more than once: rendered output lives inside `.katex`, which
 * `inLiteral` skips, so a re-render never re-processes what it already did.
 */
export async function typeset(root: HTMLElement): Promise<void> {
  if (!hasMath(root.innerHTML)) return;
  const katex = await loadKatex();

  /* A .formula holding nothing but text is LaTeX by definition — that is what
     the element is for — so it gets displayMode without the author wrapping it
     in dollars. One holding markup (<var>, <sub>, <sup>) is a card written in
     the older HTML notation and is left exactly as it was: decks in the wild
     use it, and a half-parsed formula is worse than a plain one. */
  for (const box of Array.from(root.querySelectorAll<HTMLElement>(".formula"))) {
    const raw = (box.textContent || "").trim();
    if (!raw || raw.includes("$") || box.querySelector("*")) continue;
    const rendered = renderInto(katex, raw, true);
    box.replaceChildren(...Array.from(rendered.childNodes));
    box.classList.add("has-math");
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const targets: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const t = node as Text;
    if (t.nodeValue && t.nodeValue.includes("$") && !inLiteral(t)) targets.push(t);
  }
  for (const t of targets) typesetTextNode(katex, t);

  /* A .formula that ended up holding rendered maths should stop being set in
     the monospace face it uses for ASCII notation. */
  for (const box of Array.from(root.querySelectorAll<HTMLElement>(".formula"))) {
    if (box.querySelector(".katex")) box.classList.add("has-math");
  }
}
