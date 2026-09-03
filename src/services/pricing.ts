/* ============================================================================
 * pricing.ts — what a model costs.
 *
 * OpenRouter publishes per-token pricing for its whole catalogue on /models,
 * and that catalogue covers other vendors' models too — `openai/gpt-4o-mini`,
 * `anthropic/claude-sonnet-4.5`. So one public, unauthenticated fetch prices
 * three of the five backends, and the remaining two are local inference,
 * which is free. That is the whole reason there is no hand-maintained price
 * table in this repo: a bundled table would rot, and every new model would be
 * a code edit.
 *
 * A model that still does not match reports no price at all. Showing a
 * fabricated number would be worse than showing none.
 *
 * Cached in localStorage for a day: the list is ~300KB and changes rarely.
 * ========================================================================== */
import type { ModelPrice } from "@/types/chat";

const CACHE_KEY = "drill:pricing:v1";
const TTL = 24 * 60 * 60 * 1000;
/** Hardcoded rather than taken from the resolved backend: this is fetched
 *  regardless of which backend is active, so the active base URL is usually
 *  pointing somewhere else entirely. */
const CATALOGUE = "https://openrouter.ai/api/v1/models";

/** Local inference costs nothing. That is a fact about the backend, not a
 *  missing price, so it reads "$0" rather than "—". */
const FREE: ModelPrice = { id: "local", prompt: 0, completion: 0 };

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

/** Fetch the price catalogue. Runs for every backend, not just OpenRouter —
 *  see the header. Resolves to an empty map when the network says no, which
 *  is a normal outcome, not an error. */
export function loadPricing(): Promise<Record<string, ModelPrice>> {
  if (memo) return Promise.resolve(memo);
  if (inflight) return inflight;

  const cached = readCache();
  if (cached) {
    memo = cached.models;
    return Promise.resolve(memo);
  }

  inflight = fetch(CATALOGUE)
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

/** Look up by catalogue id. Only correct for models already named the way
 *  OpenRouter names them; everything else should go through priceForModel. */
export function priceFor(modelId: string): ModelPrice | undefined {
  return memo ? memo[modelId] : undefined;
}

/** Vendors name the same model differently from the catalogue, in two ways
 *  that are both mechanical:
 *
 *    dates    Anthropic ships claude-sonnet-4-5-20250929, OpenAI ships
 *             gpt-4o-2024-08-06; the catalogue lists neither suffix.
 *    version  Anthropic's API separates the version with a hyphen
 *             (claude-sonnet-4-5); the catalogue uses a dot
 *             (claude-sonnet-4.5). Same for claude-3-5-sonnet.
 *
 *  Returns the ids worth trying, most specific first. */
function candidates(backend: string, model: string): string[] {
  const vendor = backend === "openai" ? "openai/" : backend === "anthropic" ? "anthropic/" : "";

  const undated = model.replace(/-\d{8}$/, "").replace(/-\d{4}-\d{2}-\d{2}$/, "");
  /* -4-5- → -4.5- , which also covers the older claude-3-5-sonnet shape. */
  const dotted = undated.replace(/-(\d+)-(\d+)/g, "-$1.$2");

  const bare = [model, undated, dotted];
  const out: string[] = [];
  for (const b of bare) {
    if (!out.includes(b)) out.push(b);
    if (vendor && !out.includes(vendor + b)) out.push(vendor + b);
  }
  return out;
}

/** The price for a model on a specific backend, which is what callers
 *  actually have. Returns undefined when nothing matched — the caller must
 *  render that as unknown, never as zero. */
export function priceForModel(backend: string, model: string): ModelPrice | undefined {
  if (backend === "ollama" || backend === "custom") return FREE;
  if (!memo || !model) return undefined;

  for (const id of candidates(backend, model)) {
    const hit = memo[id];
    if (hit) return hit;
  }
  return undefined;
}

export function clearPricing(): void {
  memo = null;
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}
