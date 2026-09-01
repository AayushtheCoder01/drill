import { useSyncExternalStore } from "react";

/** Subscribes the calling component to a module-singleton store — any of
 *  journalStore/memoryStore/candidates/examStore/transcript — the same
 *  useSyncExternalStore binding useDrillStore.ts uses for services/store.ts.
 *  Pass the module namespace itself: useStoreSync(journalStore). */
export function useStoreSync(mod: { subscribe: (fn: () => void) => () => void; getVersion: () => number }): number {
  return useSyncExternalStore(mod.subscribe, mod.getVersion, mod.getVersion);
}
