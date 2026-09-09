/* ============================================================================
 * SheetContext — which dialog is open. In the original app every dialog
 * rendered into one <div id="sheet">; here each "pane" is a component and
 * this context just tracks which one (plus its params) is current.
 *
 * Only the review loop mounts a SheetProvider, so a pane is only ever a
 * *review* dialog. Three of them were not: the memory browser, the memory tray
 * and the run transcript were app-wide things reachable from one section, and
 * they are pages in Settings now. Anything that would be worth opening from
 * chat, home, the journal or the exam view does not belong in this union.
 * ========================================================================== */
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { Card, QueueItem } from "@/types";

export type PaneState =
  | { name: "menu" }
  | { name: "stats" }
  | { name: "decks" }
  | { name: "library"; filter?: string; mode?: "leech" }
  | { name: "editor"; deckId: string; cardId: string | null }
  /** `source` seeds the notes box — how a memory, a journal entry or a note
   *  becomes cards without retyping it. `sourceLabel` names where it came
   *  from, so the pane can say so. */
  | { name: "ai"; source?: string; sourceLabel?: string }
  | { name: "fix"; item: QueueItem }
  | { name: "notes"; card: Card | null }
  | { name: "chat"; card: Card };

interface SheetCtx {
  pane: PaneState | null;
  open: (p: PaneState) => void;
  close: () => void;
}

const Ctx = createContext<SheetCtx | null>(null);

export function SheetProvider({ children }: { children: ReactNode }) {
  const [pane, setPane] = useState<PaneState | null>(null);
  const open = useCallback((p: PaneState) => setPane(p), []);
  const close = useCallback(() => setPane(null), []);
  return <Ctx.Provider value={{ pane, open, close }}>{children}</Ctx.Provider>;
}

export function useSheet(): SheetCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSheet must be used within SheetProvider");
  return ctx;
}
