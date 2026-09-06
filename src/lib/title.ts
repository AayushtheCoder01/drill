/* ============================================================================
 * title.ts — naming a conversation, with and without a model.
 *
 * Auto-titling is the one place the app spends a request the user did not
 * ask for, so it has to be both cheap and *final*. It used to be neither:
 * `generateTitle` capped the reply at 24 tokens, a reasoning model spent all
 * 24 on its scratchpad and returned nothing usable, and because nothing was
 * recorded about the attempt the next message tried again — and the one after
 * that. A single direct message looked like two requests forever.
 *
 * Both halves of the cure live here and are pure, so they can be tested
 * without a key: `cleanTitle` salvages what a model actually sent, and
 * `localTitle` writes a decent title from the opening message with no request
 * at all — the fallback when the call fails, and the whole mechanism when
 * auto-titling is off.
 * ========================================================================== */

/** Words that carry no subject and only eat the five words a title gets. */
const LEADING_FILLER =
  /^(?:hey|hi|hello|ok|okay|so|um|please|pls|can you|could you|would you|i want to|i need to|i'd like to|help me|tell me about|explain|what is|what are|whats|what's|how do i|how does|how to)\s+/i;

/** Trailing punctuation a title should never end on. Kept off the front so a
 *  title may legitimately open on a quote-free symbol like `#pragma`. */
const TRAILING_PUNCT = /[\s.,;:!?—–\-…"'`)\]}]+$/;

/** A word cut has to land somewhere, and landing on one of these reads as a
 *  sentence someone stopped typing — "How backprop works in a" — rather than
 *  a name. Dropped from the end only; a title may open on one. */
const TRAILING_STOPWORDS = /\s+(?:a|an|the|and|or|but|of|in|on|at|to|for|with|from|by|as|into|that|this|is|are|was|were|be|it|its|my|your)$/i;

/**
 * Turn whatever the model sent into a title, or "" if there is nothing there.
 *
 * Handles the three shapes seen in practice: a reasoning scratchpad in front
 * of the answer (closed or not), a fenced or quoted title, and a model that
 * answers the instruction rather than following it — "Title: Backprop maths".
 */
export function cleanTitle(raw: string): string {
  let s = String(raw || "");

  // The scratchpad, closed or not. An unclosed <think> means the cap was hit
  // mid-reasoning and there is no title in there at all, which is why the
  // unclosed branch drops everything rather than keeping the tail.
  s = s.replace(/<think>[\s\S]*?<\/think>/gi, "");
  if (/<think>/i.test(s)) return "";
  s = s.replace(/^[\s\S]*?<\/think>/i, "").trim();

  const fenced = s.match(/```(?:\w+)?\s*([\s\S]*?)```/);
  if (fenced) s = fenced[1];

  s = (s.split("\n").map((l) => l.trim()).find(Boolean) || "").trim();
  s = s.replace(/^(?:title|conversation title)\s*[:\-–—]\s*/i, "");
  s = s.replace(/^[["'`#*\s]+/, "").replace(/[\]"'`*]+$/, "");
  s = s.replace(TRAILING_PUNCT, "").trim();

  return s.slice(0, 60);
}

/**
 * A title from the opening message, using no model at all.
 *
 * Aims at the same shape the prompt asks a model for — two to five words
 * naming the subject, no trailing punctuation — because it stands in for the
 * model's answer, and a sidebar mixing two house styles reads as a bug.
 * Returns "" when there is nothing to name (an attachment sent with no text),
 * and the caller keeps whatever placeholder the conversation already has.
 */
export function localTitle(text: string, maxWords = 5): string {
  let s = String(text || "")
    // Fenced code and inline maths name nothing and wreck the line.
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    // Markdown emphasis and heading marks, kept as their text.
    .replace(/[*_#>]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Only the first sentence or clause: the subject is almost always there,
  // and everything after it is the part the model would have thrown away.
  s = (s.match(/^[^.!?\n—–|]+/) || [s])[0].trim();

  /* Repeatedly, because the filler stacks: "hey can you explain eigenvectors"
     is three of these in a row, and stripping one still leaves a title named
     after the politeness rather than the subject. Bounded so a message made
     entirely of filler cannot spin, and abandoned the moment stripping would
     leave nothing — "what is it" is a poor title but a better one than "". */
  for (let i = 0; i < 4; i++) {
    const shorter = s.replace(LEADING_FILLER, "").trim();
    if (!shorter || shorter === s) break;
    s = shorter;
  }

  let out = s.split(" ").filter(Boolean).slice(0, maxWords).join(" ");
  out = out.replace(TRAILING_PUNCT, "");
  while (TRAILING_STOPWORDS.test(out)) out = out.replace(TRAILING_STOPWORDS, "");
  out = out.replace(TRAILING_PUNCT, "").slice(0, 60).trim();
  if (!out) return "";

  // Lower-cased first letter reads as a fragment next to model-written
  // titles; anything already capitalised or symbolic is left exactly as sent.
  return out[0] === out[0].toLowerCase() && out[0] !== out[0].toUpperCase() ? out[0].toUpperCase() + out.slice(1) : out;
}
