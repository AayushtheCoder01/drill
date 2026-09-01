/* ============================================================================
 * pricing.ts — what a model costs, when the backend will tell us.
 *
 * OpenRouter publishes per-token pricing on /models, so conversations against
 * it can show real money. Everything else reports tokens only — showing a
 * fabricated price would be worse than showing none.
 *
 * Cached in localStorage for a day: the list is ~300KB and changes rarely.
 * ========================================================================== */
import * as AI from "@/services/ai";
import type { ModelPrice } from "@/types/chat";

const CACHE_KEY = "drill:pricing:v1";
const TTL = 24 * 60 * 60 * 1000;

interface Cache {
  at: number;
  models: Record<string, ModelPrice>;
}

let memo: Record<string, ModelPrice> | null = null;
let inflight: Promise<Record<string, ModelPrice>> | null = null;

function readCache(): Cache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Cache;
    if (!c || Date.now() - c.at > TTL) return null;
    return c;
  } catch {
    return null;
  }
}

/** Fetch pricing for the active backend. Resolves to an empty map for
 *  backends that do not publish it, which is a normal outcome, not an error. */
export function loadPricing(): Promise<Record<string, ModelPrice>> {
  if (memo) return Promise.resolve(memo);
  if (inflight) return inflight;

  const cached = readCache();
  if (cached) {
    memo = cached.models;
    return Promise.resolve(memo);
  }

  const r = AI.resolve();
  if (r.type !== "openrouter") {
    memo = {};
    return Promise.resolve(memo);
  }

  inflight = fetch(r.baseUrl + "/models")
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
    .then((j: { data?: unknown[] }) => {
      const models: Record<string, ModelPrice> = {};
      for (const raw of j.data || []) {
        const m = raw as {
          id?: string;
          name?: string;
          context_length?: number;
          pricing?: { prompt?: string; completion?: string };
        };
        if (!m.id || !m.pricing) continue;
        // OpenRouter quotes USD per token as a decimal string; we store per
        // million to keep the numbers legible.
        const prompt = parseFloat(m.pricing.prompt || "0") * 1e6;
        const completion = parseFloat(m.pricing.completion || "0") * 1e6;
        if (!isFinite(prompt) || !isFinite(completion)) continue;
        models[m.id] = { id: m.id, name: m.name, prompt, completion, contextLength: m.context_length };
      }
      memo = models;
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), models } satisfies Cache));
      } catch {
        /* quota — pricing is a nicety, not worth failing over */
      }
      return models;
    })
    .catch(() => {
      memo = {};
      return memo;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export function priceFor(modelId: string): ModelPrice | undefined {
  return memo ? memo[modelId] : undefined;
}

export function clearPricing(): void {
  memo = null;
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}
