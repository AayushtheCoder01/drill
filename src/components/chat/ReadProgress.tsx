/* ============================================================================
 * ReadProgress — how far through the conversation you are, how long it is,
 * and whether the model is still writing. One hairline under the head.
 *
 * Every scrollbar in the app is hidden by design, which reads well and costs
 * you the one thing a scrollbar was actually telling you: whether there are
 * three more paragraphs below or thirty. A long thread is the place where
 * that costs the most — a fourteen-exchange transcript is forty screens — so
 * this gives it back deliberately, and gives back the two things the
 * scrollbar never did:
 *
 *   · the ticks. One per exchange, at the point in the scroll where that
 *     exchange begins, so the length of the thread is legible as a count of
 *     things you said rather than as a distance.
 *   · the drag. Grab the rule and the transcript follows, which is the one
 *     interaction a hidden scrollbar takes away and nothing else replaces.
 *
 * While a reply is streaming the same rule carries a sweep across it, so the
 * "still working" signal lives where you are already watching the position
 * readout rather than needing a second indicator somewhere else.
 *
 * Nothing here re-renders on scroll. The fill, the ARIA values and the flat
 * state are written straight to the DOM inside one rAF, because this updates
 * on every wheel tick of a thread that can hold hundreds of nodes.
 * ========================================================================== */
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/** Below this there is nothing to report, and an always-full bar over a
 *  three-line answer would be a lie in the shape of a readout. */
const FLAT = 24;

/** Past this many exchanges the ticks stop being a count and start being
 *  texture, so they are dropped rather than drawn into a smear. */
const MAX_TICKS = 40;

export default function ReadProgress({
  scrollRef,
  busy,
  resyncKey
}: {
  /** The transcript's scroll container — `.msgs`. */
  scrollRef: RefObject<HTMLElement | null>;
  /** A reply is streaming. Drives the sweep. */
  busy: boolean;
  /** Changes whenever the thread's length or identity does, so the ticks and
   *  the fraction are recomputed for content that arrived without a scroll. */
  resyncKey: string | number;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const fillRef = useRef<HTMLDivElement | null>(null);
  const [ticks, setTicks] = useState<number[]>([]);
  const [readout, setReadout] = useState<{ x: number; label: string } | null>(null);
  const scrubbing = useRef(false);
  const frame = useRef(0);

  /* ----------------------------------------------------------- position -- */

  const paint = useCallback(() => {
    frame.current = 0;
    const el = scrollRef.current;
    const root = rootRef.current;
    const fill = fillRef.current;
    if (!el || !root || !fill) return;
    const max = el.scrollHeight - el.clientHeight;
    const flat = max <= FLAT;
    const p = flat ? 0 : Math.min(1, Math.max(0, el.scrollTop / max));
    root.classList.toggle("is-flat", flat);
    fill.style.transform = `scaleX(${p})`;
    root.setAttribute("aria-valuenow", String(Math.round(p * 100)));
  }, [scrollRef]);

  const schedule = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(paint);
  }, [paint]);

  /* --------------------------------------------------------------- ticks -- */

  /* Where each exchange starts, as the scroll fraction at which it reaches the
     top of the viewport — the same mapping the fill uses, so a tick passing
     under the leading edge means exactly "you have reached that exchange". */
  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    if (max <= FLAT) {
      setTicks((t) => (t.length ? [] : t));
      return;
    }
    const top = el.getBoundingClientRect().top - el.scrollTop;
    const turns = el.querySelectorAll<HTMLElement>(".turn.user");
    if (turns.length > MAX_TICKS) {
      setTicks((t) => (t.length ? [] : t));
      return;
    }
    const next: number[] = [];
    turns.forEach((t) => {
      const f = (t.getBoundingClientRect().top - top) / max;
      // The first exchange sits at 0 and the last can sit past 1; neither is
      // worth a mark on the rule.
      if (f > 0.012 && f < 0.988) next.push(f);
    });
    setTicks((prev) =>
      prev.length === next.length && prev.every((v, i) => Math.abs(v - next[i]) < 0.001) ? prev : next
    );
  }, [scrollRef]);

  /* ------------------------------------------------------------ wiring -- */

  /* `resyncKey` is in the deps because the scroll container is not there on
     the first render: an empty thread shows ChatEmpty instead, and a
     conversation opened straight from its URL renders once before its turns
     have loaded. Without it the effect runs once against a null ref, returns,
     and never runs again — the rule would draw its ticks and its opening
     position correctly and then never move, which is exactly how it failed
     the first time it was tested. */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", schedule, { passive: true });
    return () => el.removeEventListener("scroll", schedule);
  }, [scrollRef, schedule, resyncKey]);

  /* Content grows while a reply streams and when images or KaTeX finish
     laying out, and none of that fires a scroll event. */
  useEffect(() => {
    const el = scrollRef.current;
    const inner = el?.firstElementChild;
    if (!el || !inner || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      schedule();
      measure();
    });
    ro.observe(inner);
    ro.observe(el);
    return () => ro.disconnect();
  }, [scrollRef, schedule, measure, resyncKey]);

  useEffect(() => {
    schedule();
    measure();
  }, [schedule, measure, resyncKey]);

  /* Cancelling the pending frame without clearing the handle would wedge the
     scheduler for good: `schedule` treats a non-zero handle as "a paint is
     already coming", so a cancelled-but-not-cleared one means no paint is ever
     scheduled again. StrictMode makes that certain rather than occasional —
     it mounts, cleans up, and mounts again, so the very first cleanup is the
     one that would leave the rule frozen at zero for the whole session. */
  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    },
    []
  );

  /* -------------------------------------------------------------- scrub -- */

  const fractionAt = useCallback((clientX: number) => {
    const root = rootRef.current;
    if (!root) return 0;
    const r = root.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  }, []);

  const labelFor = useCallback(
    (f: number) => {
      const reached = ticks.filter((t) => t <= f + 0.0001).length + 1;
      const total = ticks.length + 1;
      return ticks.length ? `${Math.round(f * 100)}% · exchange ${reached} of ${total}` : `${Math.round(f * 100)}%`;
    },
    [ticks]
  );

  const seek = useCallback(
    (clientX: number) => {
      const el = scrollRef.current;
      if (!el) return;
      const max = el.scrollHeight - el.clientHeight;
      if (max <= FLAT) return;
      const f = fractionAt(clientX);
      // `auto`, never `smooth`: a drag has to track the pointer, and a smooth
      // scroll queued every pointermove fights the next one.
      el.scrollTo({ top: f * max, behavior: "auto" });
      setReadout({ x: f, label: labelFor(f) });
    },
    [scrollRef, fractionAt, labelFor]
  );

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const el = scrollRef.current;
    if (!el || el.scrollHeight - el.clientHeight <= FLAT) return;
    scrubbing.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    seek(e.clientX);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (scrubbing.current) {
      seek(e.clientX);
      return;
    }
    const el = scrollRef.current;
    if (!el || el.scrollHeight - el.clientHeight <= FLAT) return;
    const f = fractionAt(e.clientX);
    setReadout({ x: f, label: labelFor(f) });
  }

  function endScrub(e: React.PointerEvent<HTMLDivElement>) {
    if (!scrubbing.current) return;
    scrubbing.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }

  /* Keyboard reach, so the one interaction the hidden scrollbar took away is
     not mouse-only. Page-sized steps, because that is what the rule is for. */
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const el = scrollRef.current;
    if (!el) return;
    const page = el.clientHeight * 0.9;
    const map: Record<string, number> = { ArrowLeft: -page, ArrowRight: page, PageUp: -page, PageDown: page };
    if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      el.scrollTo({ top: e.key === "Home" ? 0 : el.scrollHeight, behavior: "auto" });
      return;
    }
    const d = map[e.key];
    if (d == null) return;
    e.preventDefault();
    el.scrollTo({ top: el.scrollTop + d, behavior: "auto" });
  }

  return (
    <div
      ref={rootRef}
      className={"readrule" + (busy ? " is-busy" : "") + (readout ? " is-live" : "")}
      role="progressbar"
      tabIndex={0}
      aria-label="Progress through the conversation"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endScrub}
      onPointerCancel={endScrub}
      onPointerLeave={(e) => {
        endScrub(e);
        setReadout(null);
      }}
      onKeyDown={onKeyDown}
    >
      <div className="readrule-track">
        <div ref={fillRef} className="readrule-fill" />
        {ticks.map((t) => (
          <i key={t} className="readrule-tick" style={{ left: `${t * 100}%` }} />
        ))}
        {busy && <div className="readrule-sweep" aria-hidden="true" />}
      </div>
      {readout && (
        <div className="readrule-readout" style={{ left: `${readout.x * 100}%` }}>
          {readout.label}
        </div>
      )}
    </div>
  );
}
