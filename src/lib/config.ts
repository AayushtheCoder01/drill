/* ============================================================================
 * config.ts — where Drill's settings come from, and in what order.
 *
 * Three layers, each overriding the one before it:
 *   1. DEFAULTS below
 *   2. /config.json          committed template, safe to have no key in it
 *   3. /config.local.json    yours, gitignored (public/config.local.json)
 *
 * Layer 4 — whatever you type into Settings — lives in localStorage and is
 * applied in db.ts, not here, because it is per-browser state rather than
 * deployment config.
 *
 * Served entirely over http by Vite (dev and the Vercel build alike), so
 * there is no file:// fallback to worry about — a plain fetch() is enough.
 * ========================================================================== */
import { deepMerge } from "./util";
import type { DrillConfig, FSRSParams, Settings } from "@/types";

export const DEFAULTS: DrillConfig = {
  inference: {
    type: "openrouter",
    apiKey: "",
    model: "",
    baseUrl: "",
    temperature: 0.4,
    headers: {}
  },
  decks: {
    defaultPath: "/decks",
    autoSync: true
  },
  ui: {
    retentionTarget: 0.9,
    newPerDay: 10,
    language: "en"
  },
  fsrs: {
    weights: null,
    maxInterval: 365,
    learningSteps: [10],
    relearningSteps: [10],
    fuzz: true,
    leechThreshold: 4
  }
};

interface ConfigState {
  value: DrillConfig;
  sources: string[];
  loaded: boolean;
}

const state: ConfigState = {
  value: deepMerge<DrillConfig>({}, DEFAULTS),
  sources: [],
  loaded: false
};

/** Fetch a JSON file served from /public. Resolves to null for any failure —
 *  a missing config.local.json is the normal case, not an error worth
 *  surfacing. */
async function tryFetchJSON<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(path, { cache: "no-store" });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

/**
 * Load every layer. Safe to call more than once; later calls re-read the
 * files. Always resolves — a broken config file degrades to defaults with a
 * note in .sources rather than blocking the app from starting.
 */
export async function load(): Promise<DrillConfig> {
  let merged = deepMerge<DrillConfig>({}, DEFAULTS);
  const sources = ["defaults"];

  const base = await tryFetchJSON<Partial<DrillConfig>>("/config.json");
  if (base) {
    merged = deepMerge(merged, base);
    sources.push("config.json");
  }

  const local = await tryFetchJSON<Partial<DrillConfig>>("/config.local.json");
  if (local) {
    merged = deepMerge(merged, local);
    sources.push("config.local.json");
  }

  state.value = merged;
  state.sources = sources;
  state.loaded = true;
  return merged;
}

export function get(): DrillConfig {
  return state.value;
}
export function sources(): string[] {
  return state.sources.slice();
}

/** True when a config file supplied a key, so Settings can say "provided by
 *  config" instead of showing an empty box that looks broken. */
export function hasConfigKey(): boolean {
  return !!(state.value.inference && state.value.inference.apiKey);
}

/** Scheduling params for fsrs.ts, folded together from config + the settings
 *  the user can change in the app. */
export function fsrsParams(settings?: Partial<Settings>): Partial<FSRSParams> {
  const f = state.value.fsrs || ({} as DrillConfig["fsrs"]);
  const s = settings || {};
  return {
    weights: f.weights || undefined,
    retention: s.retention != null ? s.retention : state.value.ui.retentionTarget || 0.9,
    maxInterval: s.maxIvl != null ? s.maxIvl : f.maxInterval || 365,
    learningSteps: f.learningSteps,
    relearningSteps: f.relearningSteps,
    fuzz: f.fuzz !== false,
    leechThreshold: f.leechThreshold || 4
  };
}
