/* ============================================================================
 * CardHtml — card HTML on screen, with its maths actually typeset.
 *
 * Every surface that shows a card's front or back goes through here, so a
 * formula looks the same in the review loop, the editor preview, a proposal
 * and the tutor pane. Rendering is the same dangerouslySetInnerHTML those
 * sites already did — card HTML is sanitised on the way into the store
 * (util.clean) — followed by an in-place typeset pass.
 *
 * The pass runs after paint and loads KaTeX on demand, so a deck with no
 * maths never downloads it and the text is readable before it arrives.
 * ========================================================================== */
import { useEffect, useRef } from "react";
import { typeset } from "@/lib/cardMath";

export default function CardHtml({
  html,
  className,
  as: Tag = "div"
}: {
  html: string;
  className?: string;
  /** The element to render into — `span` where a block would break the line. */
  as?: "div" | "span";
}) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // No cancellation guard: typeset() is idempotent and writes into whatever
    // the element currently holds, so a pass that resolves after a fast card
    // swap simply typesets the new card — which is what we want anyway.
    void typeset(el).catch(() => undefined);
  }, [html]);

  return (
    <Tag
      ref={ref as never}
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
