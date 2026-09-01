/* ============================================================================
 * Icon — the app's whole icon set, in one file.
 *
 * Drill used to draw its buttons with whatever Unicode glyph was closest
 * (◧ ▤ ⌘ ✦ ⋯ ✕ ▼ ★ 🎙): different metrics, different weights, different
 * vertical centring, and a different shape on every platform. These are one
 * grid, one stroke weight, one join style, and they inherit currentColor —
 * so a row of them finally looks like a row of them.
 * ========================================================================== */
import type { SVGProps } from "react";

export type IconName =
  | "moon"
  | "sun"
  | "settings"
  | "sparkle"
  | "more"
  | "close"
  | "chevron"
  | "plus"
  | "search"
  | "panel"
  | "star"
  | "star-filled"
  | "mic"
  | "pencil"
  | "archive"
  | "copy"
  | "send"
  | "stop"
  | "review"
  | "journal"
  | "exam"
  | "bubble";

/* Every path is drawn on a 24-grid, stroked, never filled — except the two
   that mean "on" (star-filled), where a fill is the whole signal. */
const PATHS: Record<IconName, { d: string; fill?: boolean }[]> = {
  moon: [{ d: "M20 14.2A8.2 8.2 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2Z" }],
  sun: [
    { d: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" },
    { d: "M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" }
  ],
  settings: [
    { d: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" },
    {
      d: "M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3.2a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9.4a1.6 1.6 0 0 0 1-1.5V3.2a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1h.3a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.5 1Z"
    }
  ],
  sparkle: [
    { d: "M12 3.5 13.6 8 18 9.6 13.6 11.2 12 15.7 10.4 11.2 6 9.6 10.4 8Z" },
    { d: "M18.5 15.5 19.2 17.3 21 18l-1.8.7-.7 1.8-.7-1.8L16 18l1.8-.7Z" }
  ],
  more: [
    { d: "M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z", fill: true },
    { d: "M19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z", fill: true },
    { d: "M5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z", fill: true }
  ],
  close: [{ d: "M6 6l12 12M18 6L6 18" }],
  chevron: [{ d: "M5 9l7 7 7-7" }],
  plus: [{ d: "M12 5v14M5 12h14" }],
  search: [{ d: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4.1-4.1" }],
  panel: [{ d: "M4 5h16v14H4zM10 5v14" }],
  star: [{ d: "m12 3.7 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.6 9.8l5.8-.8Z" }],
  "star-filled": [{ d: "m12 3.7 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.6 9.8l5.8-.8Z", fill: true }],
  mic: [{ d: "M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3ZM19 11a7 7 0 0 1-14 0M12 18v3" }],
  pencil: [{ d: "M4 20h4L20 8a2.8 2.8 0 0 0-4-4L4 16Z" }],
  archive: [{ d: "M3 7h18v3H3zM5 10v9h14v-9M10 14h4" }],
  copy: [{ d: "M9 9h11v11H9zM5 15H4V4h11v1" }],
  send: [{ d: "M4.5 12h15M13 5.5 19.5 12 13 18.5" }],
  stop: [{ d: "M7 7h10v10H7z" }],
  /* The four sections. Drawn as the object each one is — a stack of cards,
     an open book, a marked paper, a spoken line — rather than as abstract
     marks, because in the collapsed rail the icon is the only label left. */
  review: [{ d: "M3.5 9.5h12v10.5h-12z" }, { d: "M7 6h12v10.5" }],
  journal: [
    { d: "M12 6.6c-1.6-1.4-4-2.1-7-2.1v13c3 0 5.4.7 7 2.1 1.6-1.4 4-2.1 7-2.1v-13c-3 0-5.4.7-7 2.1Z" },
    { d: "M12 6.6v13" }
  ],
  bubble: [{ d: "M20.5 11.8a7.7 7.7 0 0 1-11.2 6.9L4 20l1.4-4.2a7.7 7.7 0 1 1 15.1-4Z" }],
  exam: [
    { d: "M9.5 3.5h5v3h-5z" },
    { d: "M14.5 5h2.5a1 1 0 0 1 1 1v13.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h2.5" },
    { d: "m9.5 13 1.8 1.8 3.4-3.6" }
  ]
};

export default function Icon({
  name,
  size = 16,
  ...rest
}: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {PATHS[name].map((p, i) => (
        <path key={i} d={p.d} fill={p.fill ? "currentColor" : "none"} stroke={p.fill ? "none" : "currentColor"} />
      ))}
    </svg>
  );
}
