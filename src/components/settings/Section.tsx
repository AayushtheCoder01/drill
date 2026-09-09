/* ============================================================================
 * Section — a headed group of settings, and the thing search lands on.
 *
 * Settings used to be one flat column: theme, then accent, then the API key,
 * then five switches, then the scheduler, then a tutor prompt — fifteen
 * controls with nothing to say which of them belonged together, so finding one
 * meant reading all of them. A heading and a sentence per group is the cheapest
 * possible fix and most of the difference.
 *
 * The heading and the sentence come from `catalogue.ts` rather than from the
 * call site, because search reads the same record: a group whose words live in
 * the component is a group whose words cannot be searched without being typed
 * out a second time somewhere else, and the second copy is the one that rots.
 * `title` is still accepted for the two headings that carry a live count.
 * ========================================================================== */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSettings } from "@/context/SettingsContext";
import { SECTIONS, type SectionId } from "./catalogue";

export default function Section({
  id,
  title,
  sub,
  children
}: {
  id: SectionId;
  /** Overrides the catalogue heading — for the two that count what they hold
   *  ("Decks (3)"). The catalogue keeps the plain name, which is what search
   *  matches and what a result row shows. */
  title?: string;
  sub?: string;
  children: ReactNode;
}) {
  const meta = SECTIONS[id];
  const { at, clearAt } = useSettings();
  const ref = useRef<HTMLElement | null>(null);
  const [flash, setFlash] = useState(false);

  /* Arriving from a search result: put this group at the top of the panel and
     mark it, because "the page it is on" is not an answer to "where is the
     retention dial". Behaviour is "auto" rather than "smooth" — smooth is
     silently dropped in a background tab, so the jump would be untestable and
     would look broken in exactly the place it gets checked. */
  useEffect(() => {
    if (at !== id) return;
    ref.current?.scrollIntoView({ block: "start", behavior: "auto" });
    setFlash(true);
    clearAt();
  }, [at, id, clearAt]);

  /* The flash owns its own timer rather than being cleaned up by the effect
     above. Sharing one effect meant the re-render that follows clearAt() ran
     that effect's cleanup, cancelled the timeout, and left the highlight on
     for good — the StrictMode-shaped trap, arrived at without StrictMode. */
  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(false), 1600);
    return () => window.clearTimeout(t);
  }, [flash]);

  return (
    <section ref={ref} id={"set-" + id} className={"sset" + (flash ? " found" : "")}>
      <h4 className="sset-h">{title ?? meta.title}</h4>
      <p className="sset-s">{sub ?? meta.sub}</p>
      {children}
    </section>
  );
}
