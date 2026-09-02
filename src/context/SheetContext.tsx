/* ============================================================================
 * SheetContext — which dialog is open. In the original app every dialog
 * rendered into one <div id="sheet">; here each "pane" is a component and
 * this context just tracks which one (plus its params) is current.
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
  | { name: "chat"; card: Card }
  | { name: "settings" }
  | { name: "io" }
  | { name: "examples" }
  | { name: "memory" }
  | { name: "candidates" }
  | { name: "transcript" };

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
