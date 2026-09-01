/* ============================================================================
 * util.ts — small shared helpers. No React, no storage — pure functions plus
 * two DOM-adjacent utilities (toast, download) that are safe to call from
 * anywhere in the browser.
 * ========================================================================== */

export const MIN = 60000; // one minute in ms
export const DAY = 86400000; // one day in ms

/* ---------- ids ---------- */
export function uid(prefix: string): string {
  return prefix + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
}

/**
 * Collision-proof id for anything created from v1 onward.
 *
 * uid() above is short and readable but only ~40 bits of entropy, which is
 * fine for keys inside one browser and not fine for records that may one day
 * be merged across devices. New entities (projects, memories, candidates)
 * use this instead.
 *
 * crypto.randomUUID needs a secure context; the fallback keeps file:// and
 * plain-http dev servers working.
 */
export function uuid(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  if (c && typeof c.getRandomValues === "function") {
    const b = c.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, (x) => x.toString(16).padStart(2, "0"));
    return `${h.slice(0, 4).join("")}-${h.slice(4, 6).join("")}-${h.slice(6, 8).join("")}-${h
      .slice(8, 10)
      .join("")}-${h.slice(10, 16).join("")}`;
  }
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/* ---------- text ---------- */
export function esc(s: unknown): string {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => {
    const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
    return map[c];
  });
}

/** Strip anything scripty out of card HTML. Cards come from files, the
 *  clipboard and language models, so nothing is trusted on the way in. */
export function clean(h: unknown): string {
  return String(h == null ? "" : h)
    .replace(/<\s*\/?\s*(script|iframe|object|embed|link|meta|style|form|input)[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
}

export function stripTags(h: unknown): string {
  return String(h == null ? "" : h).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function slug(s: unknown): string {
  return (
    String(s)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "deck"
  );
}

/* ---------- numbers ---------- */
export function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

/* ---------- dates ---------- */
export function dayKey(ts?: number): string {
  const d = ts == null ? new Date() : new Date(ts);
  return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
}
export function today(): string {
  return dayKey();
}
export function yesterdayKey(): string {
  return dayKey(Date.now() - DAY);
}

/** Minutes -> the shortest human reading of that span. */
export function fmt(min: number): string {
  if (min < 1) return "now";
  if (min < 60) return Math.round(min) + "m";
  if (min < 1440) return Math.round(min / 60) + "h";
  if (min < 43200) return Math.round(min / 1440) + "d";
  if (min < 525600) return Math.round((min / 43200) * 10) / 10 + "mo";
  return Math.round((min / 525600) * 10) / 10 + "y";
}

export function ago(t: number): string {
  const m = (Date.now() - t) / MIN;
  if (m < 60) return Math.round(m) + "m ago";
  if (m < 1440) return Math.round(m / 60) + "h ago";
  return Math.round(m / 1440) + "d ago";
}

/* ---------- objects ---------- */
/** Recursive merge used for config layering: later sources win, but a source
 *  that omits a key leaves the earlier value alone. Arrays replace whole. */
export function deepMerge<T extends object>(...sources: unknown[]): T {
  const out: Record<string, unknown> = {};
  for (const src of sources) {
    if (!src || typeof src !== "object") continue;
    for (const k of Object.keys(src as Record<string, unknown>)) {
      const v = (src as Record<string, unknown>)[k];
      if (v && typeof v === "object" && !Array.isArray(v)) {
        out[k] = deepMerge(out[k] || {}, v);
      } else if (v !== undefined) {
        out[k] = v;
      }
    }
  }
  return out as T;
}

/* ---------- files ---------- */
export function download(name: string, txt: string, mime?: string): void {
  const b = new Blob([txt], { type: mime || "application/json" });
  const u = URL.createObjectURL(b);
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(u);
    a.remove();
  }, 1500);
}
