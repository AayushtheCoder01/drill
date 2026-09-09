/* ============================================================================
 * SettingsContext — settings is one thing, opened from everywhere.
 *
 * It used to be three surfaces that had drifted apart: a modal off the
 * sidebar, a drawer inside chat with its own header and close button, and a
 * review-loop sheet pane that nothing had opened since the sheet router
 * gained it. Whether a given setting was reachable depended on which of the
 * three you had found, and the one thing people go looking for — the backup
 * and restore that moves a browser's worth of data to another browser — was
 * in none of them. It was in the review loop's Menu, behind a sheet that is
 * only mounted while the review loop is on screen.
 *
 * So: one piece of state, held above every view, saying which category is
 * open (or none). Anything can call `open()`; exactly one surface renders it,
 * from Shell, which is the one component all six sections agree on.
 *
 * The surface renders in Shell rather than here on purpose. Some categories
 * need a context only their own view provides — "This chat" reads
 * ChatProvider — and Shell is inside whatever providers its section mounted,
 * where a provider up here would be outside all of them.
 * ========================================================================== */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { CatId } from "@/components/settings/registry";

interface SettingsCtx {
  /** The category on screen, or null when settings is closed. There is no
   *  second copy of this inside the panel: the navigation writes here too, so
   *  "which page is showing" has one answer and `open("data")` from anywhere
   *  works whether settings is closed or already open on another page. */
  cat: CatId | null;
  open: (cat?: CatId) => void;
  close: () => void;
}

const Ctx = createContext<SettingsCtx | null>(null);

/** Where settings lands when opened with no category named. Connection is
 *  first for the same reason it is first in the list: it is the one page that
 *  decides whether the app does anything at all. */
const DEFAULT_CAT: CatId = "connection";

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [cat, setCat] = useState<CatId | null>(null);
  /* Where you were when you last closed it. Settings is a place you leave to
     check something and come straight back to, and landing on Connection
     every time makes the second visit cost as much as the first. */
  const last = useRef<CatId>(DEFAULT_CAT);

  const open = useCallback((next?: CatId) => {
    const target = next || last.current;
    last.current = target;
    setCat(target);
  }, []);
  const close = useCallback(() => setCat(null), []);

  const value = useMemo(() => ({ cat, open, close }), [cat, open, close]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings(): SettingsCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
