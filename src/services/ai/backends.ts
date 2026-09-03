/* ============================================================================
 * backends.ts — one chat() call, five places it can go.
 *
 * Adding a backend means adding one entry to BACKENDS below. Each entry
 * describes itself (does it need a key, where do you get one, what is its
 * default model) and implements two methods:
 *
 *   chat(messages, opts, ctx)  ->  Promise<string>
 *   listModels(ctx)            ->  Promise<string[]>
 *
 * `messages` is always the OpenAI shape and adapters translate outward from
 * that. `ctx` is the resolved {apiKey, model, baseUrl, headers} for the call.
 *
 * Every fetch() here runs straight from the browser to the provider — no
 * server in between, by design (see README: bring your own key). If Drill
 * ever grows a backend, this is the file that would move server-side: keep
 * the same BackendDef shape and swap fetch() targets for calls to your API.
 * ========================================================================== */
import { CHAT_ACTIONS, type ChatActionId } from "@/lib/chatActions";
import type { AIContext, BackendDef, BackendType, ChatMessage, ChatOpts, Citation, TokenUsage } from "@/types";

/** True for the exception fetch throws when an AbortSignal fires. Callers
 *  treat this as "the user stopped it", not as a failure to report. */
export function isAbort(e: unknown): boolean {
  return !!e && typeof e === "object" && (e as { name?: string }).name === "AbortError";
}

/**
 * A reply with no text in it, explained.
 *
 * Reasoning models are the usual cause: the thinking counts against
 * max_tokens, so the budget can be gone before the visible answer starts, and
 * what comes back is an empty `content` with `finish_reason: "length"` and
 * possibly a full `reasoning` block. Reported as "the model said nothing" it
 * is unfixable; reported as this it takes one settings change.
 */
function emptyReplyError(label: string, finish: string | undefined, reasoning: string): Error {
  if (finish === "length") {
    return new Error(
      label +
        " hit the token cap before writing an answer" +
        (reasoning ? " — it spent the whole budget thinking" : "") +
        ". Pick a model with reasoning off, or a smaller task."
    );
  }
  if (reasoning) {
    return new Error(
      label + " returned only its reasoning and no answer. This model needs its reasoning output disabled, or a different model."
    );
  }
  return new Error(label + " returned an empty reply" + (finish ? " (finish_reason: " + finish + ")" : "") + ".");
}

/** OpenAI-shaped usage blocks, which OpenRouter, OpenAI and most compatible
 *  servers all return under the same key names. The *_details sub-objects are
 *  optional and absent on most compatible servers; missing means zero. */
function readOpenAIUsage(j: unknown): TokenUsage | undefined {
  const u = (
    j as {
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        cost?: number;
        prompt_tokens_details?: { cached_tokens?: number };
        completion_tokens_details?: { reasoning_tokens?: number };
      };
    }
  )?.usage;
  if (!u) return undefined;
  return {
    promptTokens: u.prompt_tokens || 0,
    completionTokens: u.completion_tokens || 0,
    cachedPromptTokens: u.prompt_tokens_details?.cached_tokens || 0,
    reasoningTokens: u.completion_tokens_details?.reasoning_tokens || 0,
    /* OpenRouter reports what it actually charged. That figure includes web
       search fees, which no tokens-times-price sum can see, so it wins over
       the reconstructed one wherever it is present. */
    reportedCost: typeof u.cost === "number" ? u.cost : undefined
  };
}

/** Apply the caller's requested actions, filtered to what this backend can
 *  do. Unsupported ones are dropped rather than sent — the composer disables
 *  the chip, this is the belt to that braces. */
function applyActions(body: Record<string, unknown>, want: ChatActionId[] | undefined, can: ChatActionId[] | undefined): void {
  if (!want?.length || !can?.length) return;
  for (const id of want) {
    if (!can.includes(id)) continue;
    CHAT_ACTIONS[id]?.apply(body);
  }
}

/** OpenAI-shaped citation annotations, as OpenRouter returns them for a
 *  web-search reply. Tolerant about where they hang: the annotations array
 *  appears on the completed message, and on streamed deltas for some
 *  engines, so both paths funnel through here. */
function readCitations(node: unknown): Citation[] {
  const list = (node as { annotations?: unknown[] })?.annotations;
  if (!Array.isArray(list)) return [];
  const out: Citation[] = [];
  for (const raw of list) {
    const a = raw as { type?: string; url_citation?: Record<string, unknown> };
    const c = a?.url_citation;
    if (!c || typeof c.url !== "string") continue;
    out.push({
      url: c.url,
      title: typeof c.title === "string" && c.title.trim() ? c.title : c.url,
      content: typeof c.content === "string" ? c.content : undefined,
      start: typeof c.start_index === "number" ? c.start_index : undefined,
      end: typeof c.end_index === "number" ? c.end_index : undefined
    });
  }
  return out;
}

/** Same source twice is one source. Keeps first-seen order, which is the
 *  order the model referred to them in. */
function dedupeCitations(list: Citation[]): Citation[] {
  const seen = new Set<string>();
  return list.filter((c) => (seen.has(c.url) ? false : (seen.add(c.url), true)));
}

/* ---------------------------------------------------------------- shared */

function shortErr(t: string): string {
  try {
    const j = JSON.parse(t) as { error?: { message?: string; code?: string }; message?: string };
    return (j.error && (j.error.message || j.error.code)) || j.message || String(t).slice(0, 240);
  } catch {
    return String(t).slice(0, 240) || "no detail";
  }
}

/** Turn a failed response into something that names the actual fix. */
function httpError(label: string, res: Response, body: string): Error {
  const detail = shortErr(body);
  if (res.status === 401 || res.status === 403) {
    return new Error(label + " rejected the key (" + res.status + "). Check it in Settings — " + detail);
  }
  if (res.status === 404) {
    return new Error(label + " 404 — usually a model name that does not exist on this backend. " + detail);
  }
  if (res.status === 429) {
    return new Error(label + " rate limit or out of credit (429). " + detail);
  }
  return new Error(label + " " + res.status + " — " + detail);
}

/** A network-level failure gives no status and no body. For a local server
 *  that almost always means one of two things, so say both. */
function reachError(label: string, url: string, e: unknown): Error {
  const origin = window.location.origin;
  return new Error(
    "Could not reach " +
      label +
      " at " +
      url +
      ". Either it is not running, or it is refusing requests from " +
      origin +
      " — set OLLAMA_ORIGINS=* (or the equivalent CORS setting) and restart it. [" +
      ((e as Error)?.message || "network error") +
      "]"
  );
}

/** Read an SSE stream, hand each `data:` payload to `onEvent`. Used by the
 *  OpenAI-compatible and Anthropic adapters, which differ only in payload. */
async function readSSE(res: Response, onEvent: (j: any) => void): Promise<void> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const r = await reader.read();
    if (r.done) return;
    buf += dec.decode(r.value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line || line.charAt(0) === ":" || line.indexOf("data:") !== 0) continue;
      const p = line.slice(5).trim();
      if (p === "[DONE]") continue;
      try {
        onEvent(JSON.parse(p));
      } catch {
        /* partial frame, skip */
      }
    }
  }
}

/** Read newline-delimited JSON — Ollama's native streaming format. */
async function readNDJSON(res: Response, onObj: (j: any) => void): Promise<void> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const r = await reader.read();
    if (r.done) return;
    buf += dec.decode(r.value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      try {
        onObj(JSON.parse(line));
      } catch {
        /* partial frame, skip */
      }
    }
  }
}

/* ------------------------------------------------- OpenAI-compatible core */
/** OpenRouter, OpenAI, llama.cpp, LM Studio, vLLM and text-generation-webui
 *  all speak this. Only the headers and the default host differ. */
function openAICompatible(
  label: string,
  headerFn: (ctx: AIContext) => Record<string, string>,
  supports?: ChatActionId[]
): Pick<BackendDef, "chat" | "listModels"> {
  return {
    async chat(messages: ChatMessage[], opts: ChatOpts, ctx: AIContext): Promise<string> {
      const url = ctx.baseUrl + "/chat/completions";
      const body: Record<string, unknown> = {
        model: ctx.model,
        messages,
        temperature: opts.temperature == null ? 0.4 : opts.temperature,
        stream: !!opts.onToken
      };
      if (opts.maxTokens) body.max_tokens = opts.maxTokens;
      /* Actions the caller asked for, filtered to what this backend can
         actually do. `stream_options: {include_usage:true}` used to be set
         here; OpenRouter deprecated it and returns usage unconditionally. */
      applyActions(body, opts.actions, supports);

      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: headerFn(ctx),
          body: JSON.stringify(body),
          signal: opts.signal
        });
      } catch (e) {
        if (isAbort(e)) throw e;
        throw reachError(label, url, e);
      }
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw httpError(label, res, t);
      }
      if (!opts.onToken) {
        const j = await res.json();
        const u = readOpenAIUsage(j);
        if (u && opts.onUsage) opts.onUsage(u);
        const choice = (j.choices && j.choices[0]) || {};
        if (opts.onCitations) {
          const cites = dedupeCitations(readCitations(choice.message));
          if (cites.length) opts.onCitations(cites);
        }
        const text = (choice.message && choice.message.content) || "";
        if (!text) {
          const reasoning = String((choice.message && (choice.message.reasoning || choice.message.reasoning_content)) || "");
          throw emptyReplyError(label, choice.finish_reason, reasoning);
        }
        return text;
      }
      let out = "";
      let reasoned = false;
      let finish: string | undefined;
      let usage: TokenUsage | undefined;
      /* Where citations arrive in a stream is not documented and differs by
         search engine, so every plausible carrier is read and the result is
         deduped by url. Missing them entirely would silently drop the whole
         point of a web-search reply. */
      let cites: Citation[] = [];
      await readSSE(res, (j) => {
        const u = readOpenAIUsage(j);
        if (u) usage = u;
        cites = cites.concat(readCitations(j));
        const choice = j.choices && j.choices[0];
        if (!choice) return;
        if (choice.finish_reason) finish = choice.finish_reason;
        cites = cites.concat(readCitations(choice.message), readCitations(choice.delta));
        const d = choice.delta;
        if (!d) return;
        if (d.reasoning || d.reasoning_content) reasoned = true;
        if (d.content) {
          out += d.content;
          opts.onToken!(d.content, out);
        }
      });
      if (usage && opts.onUsage) opts.onUsage(usage);
      if (opts.onCitations && cites.length) opts.onCitations(dedupeCitations(cites));
      if (!out) throw emptyReplyError(label, finish, reasoned ? "yes" : "");
      return out;
    },

    async listModels(ctx: AIContext): Promise<string[]> {
      const url = ctx.baseUrl + "/models";
      let res: Response;
      try {
        res = await fetch(url, { headers: headerFn(ctx) });
      } catch (e) {
        throw reachError(label, url, e);
      }
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw httpError(label, res, t);
      }
      const j = await res.json();
      return ((j.data || j.models || []) as unknown[])
        .map((m) => (typeof m === "string" ? m : (m as { id?: string; name?: string }).id || (m as { name?: string }).name))
        .filter(Boolean)
        .sort() as string[];
    }
  };
}

/* --------------------------------------------------------------- backends */

function anthropicHeaders(ctx: AIContext): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-api-key": ctx.apiKey,
    "anthropic-version": "2023-06-01",
    /* Without this the API refuses browser-origin requests outright. */
    "anthropic-dangerous-direct-browser-access": "true",
    ...ctx.headers
  };
}

export const BACKENDS: Record<BackendType, BackendDef> = {
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    needsKey: true,
    local: false,
    keyUrl: "https://openrouter.ai/keys",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "anthropic/claude-sonnet-4.5",
    note: "One key, every model. Has free models on the list too.",
    /* The only backend that can search: OpenRouter runs it server-side and
       injects the results into the prompt, so it stays one request. */
    supports: ["web"],
    ...openAICompatible(
      "OpenRouter",
      (ctx) => {
      /* OpenRouter wants an origin it can attribute the call to. */
      const ref = window.location.origin && window.location.origin !== "null" ? window.location.origin : "http://localhost";
      return {
        "Content-Type": "application/json",
        Authorization: "Bearer " + ctx.apiKey,
        "HTTP-Referer": ref,
        "X-Title": "Drill",
        ...ctx.headers
      };
      },
      ["web"]
    )
  } as BackendDef,

  openai: {
    id: "openai",
    label: "OpenAI",
    needsKey: true,
    local: false,
    keyUrl: "https://platform.openai.com/api-keys",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    note: "Direct to OpenAI. Your key is sent from the browser to api.openai.com.",
    ...openAICompatible("OpenAI", (ctx) => ({
      "Content-Type": "application/json",
      Authorization: "Bearer " + ctx.apiKey,
      ...ctx.headers
    }))
  } as BackendDef,

  /* Anthropic is the one backend with a different wire format: the system
     prompt is a top-level field, not a message, and replies come back as
     content blocks. max_tokens is required. */
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    needsKey: true,
    local: false,
    keyUrl: "https://console.anthropic.com/settings/keys",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-sonnet-4-5",
    note: "Direct to Anthropic. Browser calls need the direct-access header, which Drill sends for you.",

    async chat(messages, opts, ctx) {
      const sys = messages
        .filter((m) => m.role === "system")
        .map((m) => m.content)
        .join("\n\n");
      let turns = messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));
      if (!turns.length) turns = [{ role: "user", content: sys || "Hello" }];

      const url = ctx.baseUrl + "/messages";
      const body: Record<string, unknown> = {
        model: ctx.model,
        max_tokens: opts.maxTokens || 2048,
        temperature: opts.temperature == null ? 0.4 : opts.temperature,
        messages: turns,
        stream: !!opts.onToken
      };
      if (sys) body.system = sys;

      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: anthropicHeaders(ctx),
          body: JSON.stringify(body),
          signal: opts.signal
        });
      } catch (e) {
        if (isAbort(e)) throw e;
        throw reachError("Anthropic", url, e);
      }
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw httpError("Anthropic", res, t);
      }
      if (!opts.onToken) {
        const j = await res.json();
        if (opts.onUsage && j.usage) {
          opts.onUsage({
            promptTokens: j.usage.input_tokens || 0,
            completionTokens: j.usage.output_tokens || 0,
            /* Anthropic reports cache reads and writes separately, and neither
               is included in input_tokens. Both are prompt-side work. */
            cachedPromptTokens: (j.usage.cache_read_input_tokens || 0) + (j.usage.cache_creation_input_tokens || 0)
          });
        }
        const text = ((j.content || []) as { type: string; text?: string }[])
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("");
        if (!text) throw emptyReplyError("Anthropic", j.stop_reason, "");
        return text;
      }
      let out = "";
      // Anthropic splits usage across two events: input on message_start,
      // output on message_delta.
      let promptTokens = 0;
      let completionTokens = 0;
      let cachedPromptTokens = 0;
      await readSSE(res, (j) => {
        if (j.type === "message_start" && j.message?.usage) {
          promptTokens = j.message.usage.input_tokens || 0;
          completionTokens = j.message.usage.output_tokens || 0;
          cachedPromptTokens = (j.message.usage.cache_read_input_tokens || 0) + (j.message.usage.cache_creation_input_tokens || 0);
        }
        if (j.type === "message_delta" && j.usage) {
          completionTokens = j.usage.output_tokens || completionTokens;
        }
        if (j.type === "content_block_delta" && j.delta && j.delta.type === "text_delta") {
          out += j.delta.text;
          opts.onToken!(j.delta.text, out);
        }
      });
      if (opts.onUsage && (promptTokens || completionTokens)) opts.onUsage({ promptTokens, completionTokens, cachedPromptTokens });
      return out;
    },

    async listModels(ctx) {
      const url = ctx.baseUrl + "/models?limit=100";
      let res: Response;
      try {
        res = await fetch(url, { headers: anthropicHeaders(ctx) });
      } catch (e) {
        throw reachError("Anthropic", url, e);
      }
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw httpError("Anthropic", res, t);
      }
      const j = await res.json();
      return ((j.data || []) as { id?: string }[]).map((m) => m.id).filter(Boolean).sort() as string[];
    }
  },

  /* Ollama's native endpoints. /api/chat rather than /api/generate because
     Drill sends real conversations — system + user + assistant turns — and
     /api/generate flattens all of that into one prompt string. */
  ollama: {
    id: "ollama",
    label: "Ollama (local)",
    needsKey: false,
    local: true,
    keyUrl: "https://ollama.com/download",
    defaultBaseUrl: "http://localhost:11434",
    defaultModel: "llama3.1:8b",
    note: "Runs on your machine, costs nothing. Needs OLLAMA_ORIGINS=* so the browser is allowed to call it.",

    async chat(messages, opts, ctx) {
      const url = ctx.baseUrl + "/api/chat";
      const body: Record<string, unknown> = {
        model: ctx.model,
        messages,
        stream: !!opts.onToken,
        options: { temperature: opts.temperature == null ? 0.4 : opts.temperature }
      };
      if (opts.maxTokens) (body.options as Record<string, unknown>).num_predict = opts.maxTokens;

      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...ctx.headers },
          body: JSON.stringify(body),
          signal: opts.signal
        });
      } catch (e) {
        if (isAbort(e)) throw e;
        throw reachError("Ollama", url, e);
      }
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        if (res.status === 404) {
          throw new Error('Ollama has no model called "' + ctx.model + '". Pull it first:  ollama pull ' + ctx.model);
        }
        throw httpError("Ollama", res, t);
      }
      const reportOllamaUsage = (j: { prompt_eval_count?: number; eval_count?: number }) => {
        if (!opts.onUsage) return;
        if (j.prompt_eval_count == null && j.eval_count == null) return;
        opts.onUsage({ promptTokens: j.prompt_eval_count || 0, completionTokens: j.eval_count || 0 });
      };
      if (!opts.onToken) {
        const j = await res.json();
        reportOllamaUsage(j);
        const text = (j.message && j.message.content) || j.response || "";
        if (!text) throw emptyReplyError("Ollama", j.done_reason, String((j.message && j.message.thinking) || ""));
        return text;
      }
      let out = "";
      await readNDJSON(res, (j) => {
        if (j.done) reportOllamaUsage(j);
        const t = (j.message && j.message.content) || j.response;
        if (t) {
          out += t;
          opts.onToken!(t, out);
        }
      });
      return out;
    },

    async listModels(ctx) {
      const url = ctx.baseUrl + "/api/tags";
      let res: Response;
      try {
        res = await fetch(url);
      } catch (e) {
        throw reachError("Ollama", url, e);
      }
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw httpError("Ollama", res, t);
      }
      const j = await res.json();
      return ((j.models || []) as { name?: string; model?: string }[])
        .map((m) => m.name || m.model)
        .filter(Boolean)
        .sort() as string[];
    }
  },

  /* Anything else that speaks the OpenAI wire format: llama.cpp's server,
     LM Studio, vLLM, text-generation-webui, a company gateway. */
  custom: {
    id: "custom",
    label: "OpenAI-compatible (llama.cpp, LM Studio, vLLM…)",
    needsKey: false,
    local: true,
    keyUrl: "",
    defaultBaseUrl: "http://localhost:8080/v1",
    defaultModel: "local-model",
    note: "Point Base URL at any /v1 endpoint that speaks the OpenAI chat format. Key optional.",
    ...openAICompatible("Backend", (ctx) => {
      const h: Record<string, string> = { "Content-Type": "application/json", ...ctx.headers };
      if (ctx.apiKey) h.Authorization = "Bearer " + ctx.apiKey;
      return h;
    })
  } as BackendDef
};

export const BACKEND_ORDER: BackendType[] = ["openrouter", "ollama", "openai", "anthropic", "custom"];
