/* ============================================================================
 * pricing.ts — what a model costs.
 *
 * OpenRouter publishes per-token pricing for its whole catalogue on /models,
 * so one public, unauthenticated fetch prices every model it serves. That is
 * the whole reason there is no hand-maintained price table in this repo: a
 * bundled table would rot, and every new model would be a code edit.
 *
 * Which backends that applies to is the backend's own business, declared as
 * `pricing` on its BackendDef rather than decided by a list of ids here:
 *
 *   catalogue  look it up below
 *   free       nothing to pay — Ollama runs locally, Groq's tier is free
 *   unpriced   we do not know
 *
 * The third state used to be missing, and its absence was a real bug: the
 * custom backend was assumed local and hardcoded to $0, so pointing it at a
 * paid hosted API — the obvious thing to do with it — billed you and reported
 * every call as free.
 *
 * A model that matches nothing reports no price at all. Showing a fabricated
 * number would be worse than showing none.
 *
 * Cached in localStorage for a day: the list is ~300KB and changes rarely.
 * ========================================================================== */
import { BACKENDS } from "@/services/ai/backends";
import type { ModelPrice } from "@/types/chat";

const CACHE_KEY = "drill:pricing:v1";
const TTL = 24 * 60 * 60 * 1000;
/** Hardcoded rather than taken from the resolved backend: this is fetched
 *  regardless of which backend is active, so the active base URL is usually
 *  pointing somewhere else entirely. */
const CATALOGUE = "https://openrouter.ai/api/v1/models";

/** Costs nothing. That is a fact about the backend, not a missing price, so
 *  it reads "$0" rather than "—". */
const FREE: ModelPrice = { id: "free", prompt: 0, completion: 0 };

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

/** Vendors name the same model differently from the catalogue in two ways
 *  that are both mechanical:
 *
 *    dates    a model shipped as gpt-4o-2024-08-06 or claude-sonnet-4-5-20250929;
 *             the catalogue lists neither suffix.
 *    version  an API that separates the version with a hyphen
 *             (claude-sonnet-4-5) where the catalogue uses a dot
 *             (claude-sonnet-4.5).
 *
 *  Returns the ids worth trying, most specific first. */
function candidates(model: string): string[] {
  const undated = model.replace(/-\d{8}$/, "").replace(/-\d{4}-\d{2}-\d{2}$/, "");
  /* -4-5- → -4.5- , which also covers the older claude-3-5-sonnet shape. */
  const dotted = undated.replace(/-(\d)-(\d)(?=-|$)/, "-$1.$2");

  const out: string[] = [];
  for (const id of [model, undated, dotted]) {
    if (id && out.indexOf(id) < 0) out.push(id);
  }
  return out;
}

export function priceForModel(backend: string, model: string): ModelPrice | undefined {
  /* An unknown backend id is treated as unpriced, not as free. */
  const mode = BACKENDS[backend as keyof typeof BACKENDS]?.pricing ?? "unpriced";
  if (mode === "free") return FREE;
  if (mode !== "catalogue") return undefined;
  if (!memo || !model) return undefined;

  for (const id of candidates(model)) {
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
