/* ============================================================================
 * cardFormat.ts — the engine that turns whatever a model wrote into the
 * house card format.
 *
 * Cards arrive from a lot of places — generateCards, distill, an exam
 * follow-up, a pasted import, the editor — and a model asked for HTML will
 * still hand you markdown fences, `backticks`, \(...\) delimiters, or a bare
 * \frac sitting in prose. Fixing the shipped deck by hand fixes nothing about
 * the next card the model writes, so normalisation belongs at the one place
 * every card passes through: store.normCard.
 *
 * The contract this produces, which lib/cardMath.ts then renders:
 *
 *   inline maths     $...$
 *   displayed maths  <div class="formula">…</div>
 *   inline code      <code>…</code>
 *   code block       <div class="shape">…</div>
 *
 * Two rules keep it from doing damage:
 *
 *   1. **Idempotent.** Running it twice is running it once. Cards are
 *      re-normalised on every import and every edit, so a transform that
 *      compounds would slowly destroy a deck.
 *
 *   2. **Conservative.** It only rewrites what is unambiguous. Guessing that
 *      "2/3 of the time" is a fraction would corrupt prose, and a wrong
 *      rewrite is worse than a plain one — so ASCII maths is left alone and
 *      the model is asked for LaTeX instead (see STYLE_RULES in services/ai).
 * ========================================================================== */

const SEP = "⁣"; // invisible separator — same trick lib/markdown.ts uses
const TOKEN_RE = /⁣(\d+)⁣/g;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Hide everything that must not be rewritten — existing tags and anything
 *  already marked up as code — so the text transforms below can work on plain
 *  prose without ever matching inside markup. */
function mask(src: string): { text: string; parts: string[] } {
  const parts: string[] = [];
  const keep = (m: string) => {
    parts.push(m);
    return `${SEP}${parts.length - 1}${SEP}`;
  };
  const text = src
    .replace(/<(code|pre)\b[^>]*>[\s\S]*?<\/\1>/gi, keep)
    /* A .formula block is LaTeX by definition — cardMath renders its contents
       in display mode with no delimiters — so wrapping what is inside it in
       dollars would both corrupt it and make this pass non-idempotent. */
    .replace(/<div class=["'](shape|formula)["'][^>]*>[\s\S]*?<\/div>/gi, keep)
    .replace(/<[^>]+>/g, keep);
  return { text, parts };
}

function unmask(text: string, parts: string[]): string {
  return text.replace(TOKEN_RE, (m, i: string) => parts[Number(i)] ?? m);
}

/** Characters that can continue a maths expression once one has started. */
const MATH_CHAR = /[A-Za-z0-9\\{}^_()[\]+\-*/=<>|,.'!:;\s&]/;

/**
 * Find the end of a LaTeX expression that began at `start` (a backslash).
 *
 * Scanned rather than matched by regex because the hard part is knowing where
 * to *stop*: `\alpha is the learning rate` must capture `\alpha` and not the
 * English after it. The rule is that a space only continues the expression
 * when the next thing is itself maths — another command, a brace, a digit or
 * an operator — and never when it is an ordinary word.
 */
function scanLatex(s: string, start: number): number {
  let i = start;
  let depth = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth = Math.max(0, depth - 1);

    if (/\s/.test(ch) && depth === 0) {
      // Look past the run of spaces at what comes next.
      let j = i;
      while (j < s.length && /\s/.test(s[j])) j++;
      const next = s[j];
      if (next === undefined) return i;
      /* A letter only continues the expression when it is carrying a script or
         an argument — `x^{(i)}` is part of the maths, `is` is English. */
      const scripted = /[A-Za-z]/.test(next) && /[\^_(]/.test(s[j + 1] || "");
      const continues = next === "\\" || scripted || /[0-9{(^_+\-*/=|[]/.test(next);
      if (!continues) return i;
      i = j;
      continue;
    }

    if (!MATH_CHAR.test(ch)) return i;
    i++;
  }
  return i;
}

/** Is this offset inside a `$…$` or `$$…$$` span already? */
function dollarSpans(s: string): [number, number][] {
  const spans: [number, number][] = [];
  const re = /\$\$[\s\S]+?\$\$|\$[^$\n]+?\$/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) spans.push([m.index, m.index + m[0].length]);
  return spans;
}

/** Wrap bare LaTeX — a `\command` sitting in prose with no delimiters — in
 *  `$…$`, so cardMath can find it. Already-delimited maths is left untouched,
 *  which is what makes this safe to run repeatedly. */
function wrapBareLatex(text: string): string {
  const spans = dollarSpans(text);
  const inside = (i: number) => spans.some(([a, b]) => i >= a && i < b);

  let out = "";
  let i = 0;
  while (i < text.length) {
    if (text[i] === "\\" && /[a-zA-Z]/.test(text[i + 1] || "") && !inside(i)) {
      const end = scanLatex(text, i);
      const expr = text.slice(i, end).trimEnd();
      // A lone \\ or a command with nothing around it is not worth wrapping.
      if (expr.length > 2) {
        out += "$" + expr + "$";
        i = i + expr.length;
        continue;
      }
    }
    out += text[i];
    i++;
  }
  return out;
}

/**
 * Turn whatever a model wrote into the house format.
 *
 * Order matters: code is masked before maths is touched, so a `$` in a shell
 * snippet is never read as a delimiter.
 */
export function normaliseCardHtml(raw: unknown): string {
  let s = String(raw == null ? "" : raw);
  if (!s.trim()) return "";

  /* ---- code fences and backticks, before anything else ---- */
  s = s.replace(/```[a-zA-Z0-9+#-]*\n?([\s\S]*?)```/g, (_m, body: string) => {
    return `<div class="shape">${escapeHtml(String(body).replace(/\n+$/, ""))}</div>`;
  });
  s = s.replace(/`([^`\n]+)`/g, (_m, body: string) => `<code>${escapeHtml(body)}</code>`);

  /* ---- from here on, existing markup is off limits ---- */
  const { text, parts } = mask(s);
  let t = text;

  // LaTeX's other delimiters, normalised onto the pair cardMath understands.
  t = t.replace(/\\\[([\s\S]+?)\\\]/g, (_m, tex: string) => `$$${tex.trim()}$$`);
  t = t.replace(/\\\(([\s\S]+?)\\\)/g, (_m, tex: string) => `$${tex.trim()}$`);

  t = wrapBareLatex(t);

  s = unmask(t, parts);

  /* ---- a displayed expression alone in a paragraph becomes a formula ---- */
  s = s.replace(/<p>\s*\$\$([\s\S]+?)\$\$\s*<\/p>/g, (_m, tex: string) => `<div class="formula">${tex.trim()}</div>`);
  s = s.replace(/^\s*\$\$([\s\S]+?)\$\$\s*$/g, (_m, tex: string) => `<div class="formula">${tex.trim()}</div>`);

  return s;
}
