/* ============================================================================
 * theme.ts — turns Settings.theme/accent/density/textScale into actual pixels.
 *
 * The stylesheet never hardcodes a colour for the accent: every accent-tinted
 * rule composes oklch(var(--accent-l) var(--accent-c) var(--accent-h) / a)
 * through the named tints in tokens.css, so picking a new accent here
 * re-skins the whole app — buttons, links, chips, the ladder's marker —
 * without a single component knowing it happened.
 *
 * The printing (night/day) is a data attribute rather than a media query:
 * it is a setting the reader chose, not a guess about their OS.
 * ========================================================================== */
import type { Accent, Density, Settings, Theme } from "@/types";

interface AccentDef {
  /** Lightness on the night printing. */
  l: string;
  /** Lightness on the day printing — the same hue at 62% is a confident link
   *  on a dark page and an unreadable one on paper, so each accent carries
   *  both and applyAppearance picks. */
  ld: string;
  c: string;
  h: string;
  label: string;
}

/** Same lightness/chroma family across every hue so switching accents never
 *  changes how loud the UI feels, only its colour. */
export const ACCENTS: Record<Accent, AccentDef> = {
  blue: { l: "62%", ld: "48%", c: "0.19", h: "262", label: "Blue" },
  violet: { l: "62%", ld: "48%", c: "0.19", h: "300", label: "Violet" },
  teal: { l: "64%", ld: "48%", c: "0.14", h: "190", label: "Teal" },
  green: { l: "68%", ld: "48%", c: "0.16", h: "150", label: "Green" },
  amber: { l: "72%", ld: "52%", c: "0.14", h: "55", label: "Amber" },
  rose: { l: "64%", ld: "48%", c: "0.17", h: "20", label: "Rose" }
};

export const ACCENT_ORDER: Accent[] = ["blue", "violet", "teal", "green", "amber", "rose"];

export const THEMES: { id: Theme; label: string }[] = [
  { id: "night", label: "Night" },
  { id: "day", label: "Day" }
];

const MIN_SCALE = 0.9;
const MAX_SCALE = 1.2;

/** The swatch colour to draw for an accent in a given printing — so the
 *  picker shows the ink you will actually get, not the night one on paper. */
export function accentSwatch(id: Accent, theme: Theme): string {
  const a = ACCENTS[id] || ACCENTS.blue;
  return `oklch(${theme === "day" ? a.ld : a.l} ${a.c} ${a.h})`;
}

/** Applies appearance settings to :root. Idempotent and cheap (a handful of
 *  custom-property writes) so it is safe to call on every store change
 *  rather than diffing what actually moved. */
export function applyAppearance(
  settings: Pick<Settings, "accent" | "density" | "textScale"> & Partial<Pick<Settings, "theme">>
): void {
  const root = document.documentElement;
  const theme: Theme = settings.theme === "day" ? "day" : "night";
  const a = ACCENTS[settings.accent] || ACCENTS.blue;

  root.dataset.theme = theme;
  root.style.setProperty("--accent-l", theme === "day" ? a.ld : a.l);
  root.style.setProperty("--accent-c", a.c);
  root.style.setProperty("--accent-h", a.h);
  root.dataset.density = settings.density === "compact" ? "compact" : "comfortable";

  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, settings.textScale || 1));
  root.style.setProperty("--text-scale", String(scale));

  /* Keep the browser's own chrome — form controls, scrollbars, the address
     bar on mobile — on the same printing as the page. */
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "day" ? "#f7f4ee" : "#2b2723");
}
