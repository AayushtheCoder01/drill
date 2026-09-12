/* ============================================================================
 * useReadingHighlight — light up the sentence being read, and keep it on
 * screen for as long as the reader lets it.
 *
 * Painted with the CSS Custom Highlight API: a Range registered under a name
 * the stylesheet styles through ::highlight(). The reply's markup belongs to
 * React, set through dangerouslySetInnerHTML, and wrapping the sentence in a
 * <mark> would be exactly the markup-splicing this codebase refuses — this
 * highlight touches no node at all. A browser without the API gets the
 * paragraph marked with a class instead, which is coarser and still right.
 *
 * The ranges come from segmenting the rendered reply again, not from the
 * player, which holds text only. So a turn that re-mounts — a thread switched
 * away from and back to — finds its sentence on its own. Segmenting is
 * deterministic and the counts are compared anyway: a mismatch paints nothing
 * rather than the wrong sentence.
 *
 * Following never fights the reader. Scrolling by hand turns it off (ListenBar
 * watches for that) and the bar turns it back on — the transcript's own "never
 * yank the viewport" rule, applied to a second thing that wants to scroll.
 * ========================================================================== */
import { useEffect, useRef, useSyncExternalStore, type RefObject } from "react";
import { player } from "@/services/speech/player";
import { segmentReply, type ReadSentence } from "@/lib/speech/segment";

const NAME = "drill-reading";

/* One highlight in the whole document, so one owner. A turn that stops being
   read clears the highlight only if it is still the one that set it — the
   next reply may already have painted its own. */
let owner: string | null = null;
let marked: Element | null = null;

function canHighlight(): boolean {
  return typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight !== "undefined";
}

function blockOf(range: Range): Element | null {
  const n = range.startContainer;
  const el = n.nodeType === Node.ELEMENT_NODE ? (n as Element) : n.parentElement;
  return el?.closest("p, li, h1, h2, h3, h4, h5, h6, blockquote, tr, .codeblock, .katex-display") || el;
}

function paint(id: string, range: Range): void {
  owner = id;
  if (canHighlight()) {
    CSS.highlights.set(NAME, new Highlight(range));
    return;
  }
  const block = blockOf(range);
  if (marked === block) return;
  marked?.classList.remove("is-reading");
  block?.classList.add("is-reading");
  marked = block;
}

function unpaint(id: string): void {
  if (owner !== id) return;
  owner = null;
  if (canHighlight()) CSS.highlights.delete(NAME);
  marked?.classList.remove("is-reading");
  marked = null;
}

function follow(range: Range, root: Element): void {
  const scroller = root.closest(".msgs");
  if (!scroller) return;
  let rect = range.getBoundingClientRect();
  if (!rect.height) rect = blockOf(range)?.getBoundingClientRect() || rect;
  const box = scroller.getBoundingClientRect();
  const margin = Math.min(96, box.height / 4);
  if (rect.top >= box.top + margin && rect.bottom <= box.bottom - margin) return;
  scroller.scrollTo({ top: scroller.scrollTop + (rect.top - box.top) - box.height / 3, behavior: "smooth" });
}

export interface HighlightTarget {
  conversationId: string;
  turnId: string;
  variant: number;
  /** The rendered reply. A change means the sentences have to be found again. */
  html: string;
  root: RefObject<Element | null>;
  /** False for anything that cannot be read: a user turn, a reply mid-stream. */
  enabled: boolean;
}

/** Whether this reply is the one being read aloud. */
export function useReadingHighlight(t: HighlightTarget): boolean {
  useSyncExternalStore(player.subscribe, player.getVersion, player.getVersion);
  const st = player.get();
  const src = st.source;
  const mine =
    t.enabled &&
    st.status !== "idle" &&
    !!src &&
    src.conversationId === t.conversationId &&
    src.turnId === t.turnId &&
    src.variant === t.variant;
  const id = `${t.conversationId}:${t.turnId}:${t.variant}`;
  const found = useRef<{ html: string; sentences: ReadSentence[] } | null>(null);

  useEffect(() => {
    const root = t.root.current;
    if (!mine || !root || !src) return;
    if (!found.current || found.current.html !== t.html) found.current = { html: t.html, sentences: segmentReply(root) };
    const sentences = found.current.sentences;
    const s = sentences.length === src.sentences.length ? sentences[st.index] : undefined;
    if (!s) return;
    paint(id, s.range);
    if (st.following) follow(s.range, root);
  }, [mine, st.index, st.following, t.html, id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!mine) return;
    return () => unpaint(id);
  }, [mine, id]);

  return mine;
}
