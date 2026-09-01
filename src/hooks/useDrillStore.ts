import { useSyncExternalStore } from "react";
import * as store from "@/services/store";
import type { DrillDB } from "@/types";

/** Subscribes the calling component to every mutation of the Drill store.
 *  store.ts is a module-level singleton (not React state) so the review
 *  loop, keyboard shortcuts and every pane can read/write it without prop
 *  drilling; this hook is just the React binding on top of it. */
export function useDrillStore(): DrillDB {
  useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion);
  return store.get();
}
