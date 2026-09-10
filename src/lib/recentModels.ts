/* ============================================================================
 * recentModels.ts — the last few models actually chosen, most recent first.
 *
 * Global rather than per-backend or per-conversation: picking a model from
 * the chip is a habit ("the cheap one for this, the smart one for that") and
 * someone bouncing between two or three favourites wants them close by
 * regardless of which project or thread they picked them from originally.
 * ========================================================================== */
const KEY = "drill:recentModels:v1";
const MAX = 8;

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string" && !!x) : [];
  } catch {
    return [];
  }
}

/** Most recent first. Not filtered against what a backend currently lists —
 *  callers intersect with the live list themselves, since a recent id from a
 *  backend you have since switched away from is still worth remembering. */
export function recentModels(): string[] {
  return read();
}

export function recordModelUse(id: string): void {
  const v = id.trim();
  if (!v) return;
  const next = [v, ...read().filter((m) => m !== v)].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* a recents list is a nicety, not worth failing over */
  }
}
