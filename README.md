# Drill

Spaced repetition that makes you write the answer before you see it, marks what
you wrote, and schedules the card with FSRS-6. Bring your own API key, or run it
entirely on your own machine with Ollama.

A Vite + React + TypeScript frontend. No account, no server, no telemetry —
your cards and your API key never leave your browser (or `config.local.json`
on your own machine). Deploys as a static site to Vercel's free tier.

---

## Features

### Chat

A full chat client that happens to know what you have been studying. That is
the whole point of it living here rather than in a browser tab pointed at
openrouter.ai.

- **Any backend** — the same OpenRouter / Ollama / OpenAI / Anthropic /
  OpenAI-compatible picker the rest of the app uses, but chosen **per
  conversation**, so a cheap model can mark recall while a strong one writes
  cards.
- **It can see your decks** — attach your weak cards, what is due today, a
  whole deck, or your insight log. Context is rebuilt from your real progress
  every time you send, so a thread you return to next week reflects next
  week's gaps.
- **Any reply becomes flashcards** — one click on a message, or select a
  paragraph first. Pick the deck, untick the weak ones, done.
- **Any reply becomes a note** — straight into the insight log.
- **Modes, not personalities** — Tutor, Socratic (never gives the answer),
  Explainer, Feynman check (you explain, it finds the holes), ML researcher,
  Code, or a raw model with no system prompt.
- **Slash commands** — `/quiz` on what's due, `/weak` to attack what you keep
  failing, `/cards`, `/explain`, `/feynman`, `/note`, `/export`.
- **Proper rendering** — Markdown, LaTeX via KaTeX, syntax-highlighted code
  with copy buttons, tables.
- **The usual platform things** — streaming with a stop button, regenerate
  with variant history, edit and resend, branch a tangent into its own thread,
  full-text search across every conversation, attachments, `ctrl+K` command
  palette, token and cost accounting.

### Review

- **FSRS-6 scheduling** — the algorithm Anki ships. Models each card's memory
  *stability* and *difficulty* separately instead of one blunt ease factor, and
  aims every interval at your target retention.
- **Free recall** — you type the answer from memory before the card flips.
  Recognising an answer is not remembering it.
- **AI marking** — the model compares your attempt to the card, names what you
  left out, and *suggests* a grade. You still press the button.
- **Interleaving** — consecutive cards from the same section get shuffled apart,
  and "Mix all decks" drills everything due together.
- **Leech repair** — a card that lapses four times gets flagged, and the fix
  button splits it into atomic cards instead of grinding it again.
- **Insight log** — press `n` any time. Any entry turns into cards with one tap.
- **AI tutor** — "Go deeper" under any revealed answer, with three starters. If
  you wrote a recall attempt, it opens by critiquing *that*.

---

## Quick start

```bash
git clone https://github.com/YOUR-USERNAME/drill.git
cd drill
npm install
npm run dev
```

Opens at `http://localhost:5173` (or wherever Vite prints). Paste an API key
under **⋯ → Settings** and you are running. Everything below is optional.

> **One rule: always open it the same way.** Browsers store your progress per
> origin. `http://localhost:5173` in dev and your deployed URL are two
> different stores. Pick the one you use day to day, and export a backup
> before switching (**⋯ → Import / export → Export everything**).

### Deploying to Vercel

Drill is a static site — `npm run build` produces `dist/`, and that's the
whole deployment.

1. Push the repo to GitHub.
2. [Import it on Vercel](https://vercel.com/new) — the free tier is plenty.
   Vercel auto-detects the Vite framework preset; `vercel.json` in this repo
   pins the build command and output directory so it works even if it
   doesn't.
3. No environment variables are required. Every credential is typed into
   Settings by whoever is using the deployed app and stored in *their*
   browser — nothing is baked into the build or read from the server.

Or from the CLI:

```bash
npm i -g vercel
vercel
```

There is no backend to configure. If you later add one (see
[Project layout](#project-layout) below), that's the point at which you'd
start setting Vercel environment variables and adding API routes.

### Configuring by file instead

Typing the key into Settings is enough. If you would rather keep it in a file
— to move between machines, or to pin a model for everyone on a shared
deployment:

```bash
cp public/config.json public/config.local.json
```

Edit `public/config.local.json`. It is gitignored, so your key never gets
committed, and it is never bundled into the production build — Drill fetches
it at runtime, so it also works dropped next to a deployed `dist/` build.

```json
{
  "inference": {
    "type": "openrouter",
    "apiKey": "sk-or-v1-...",
    "model": "anthropic/claude-sonnet-4.5"
  }
}
```

Settings you change inside the app always beat the config file, so a shared
`config.json` can ship defaults without pinning anyone to them.

---

## Setup guides

### OpenRouter — easiest

One key, every model, including free ones.

1. Get a key at [openrouter.ai/keys](https://openrouter.ai/keys)
2. **⋯ → Settings**, leave the backend on **OpenRouter**, paste the key
3. **Load model list**, pick a model, **Test**

`anthropic/claude-sonnet-4.5` writes the best cards. `google/gemini-2.5-flash`
or `deepseek/deepseek-chat` are cheap for marking. There are `:free` models on
the list too.

```json
{ "inference": { "type": "openrouter", "apiKey": "sk-or-v1-...", "model": "anthropic/claude-sonnet-4.5" } }
```

### Ollama — local, free, offline

Nothing leaves your machine and there is nothing to pay for. (Only works when
running Drill locally — a Vercel deployment can't reach `localhost:11434` on
your machine unless you're the one visiting it.)

1. Install [Ollama](https://ollama.com/download) and pull a model:

   ```bash
   ollama pull llama3.1:8b
   ```

2. **Let the browser talk to it.** This is the step everyone misses. Ollama
   refuses cross-origin requests by default, and a browser page counts as one:

   **Windows** — set it once, then restart Ollama from the tray:
   ```bash
   setx OLLAMA_ORIGINS "*"
   ```

   **macOS / Linux** — for the current shell:
   ```bash
   OLLAMA_ORIGINS="*" ollama serve
   ```
   To make it stick on macOS: `launchctl setenv OLLAMA_ORIGINS "*"` then restart
   Ollama. On Linux with systemd: `systemctl edit ollama.service`, add
   `Environment="OLLAMA_ORIGINS=*"`, then `systemctl restart ollama`.

3. **⋯ → Settings → Ollama (local)**, set the model to what you pulled, **Test**.

```json
{ "inference": { "type": "ollama", "model": "llama3.1:8b", "baseUrl": "http://localhost:11434" } }
```

No key needed. Drill uses Ollama's `/api/chat` endpoint rather than
`/api/generate`, because it sends real conversations — system, user and
assistant turns — and `/api/generate` would flatten all of that into one string.

**What to expect from a small model.** An 8B model marks recall attempts
acceptably and is fine for the tutor. Card *writing* is where the gap shows: it
will drift out of house style and sometimes return prose instead of JSON. If you
have the memory, a 14B–32B model is a real step up for that one job. You can
keep a hosted model for writing cards and switch to Ollama for everything else —
the backend picker is one dropdown.

### OpenAI

```json
{ "inference": { "type": "openai", "apiKey": "sk-...", "model": "gpt-4o-mini" } }
```

Key from [platform.openai.com/api-keys](https://platform.openai.com/api-keys).
Drill calls the REST API directly with `fetch` rather than pulling in the
`openai` SDK — the wire format is identical, and it keeps the dependency list
short.

### Anthropic

```json
{ "inference": { "type": "anthropic", "apiKey": "sk-ant-...", "model": "claude-sonnet-4-5" } }
```

Key from [console.anthropic.com](https://console.anthropic.com/settings/keys).
The API blocks browser-origin requests unless asked not to; Drill sends the
`anthropic-dangerous-direct-browser-access` header for you. That is fine for a
personal deployment where you are your own user — do not do it in anything
you deploy for other people to enter their key into.

### Anything OpenAI-compatible

llama.cpp's server, LM Studio, vLLM, text-generation-webui, a company gateway:

```json
{ "inference": { "type": "custom", "baseUrl": "http://localhost:8080/v1", "model": "local-model", "apiKey": "" } }
```

Point `baseUrl` at the `/v1` root. The key is optional.

---

## Using it

- **✦ From a topic** — "logistic regression: sigmoid, decision boundary, log
  loss" → 10 cards in the house style of your existing deck. Untick the weak
  ones before they land.
- **✦ From notes** — paste a lecture transcript or a textbook section.
- **Go deeper** — under any revealed answer, with three starters: why is this
  true / test me on it / where does it show up next. Tutor language switches
  between English and Hinglish in Settings; cards stay English.
- **Where you're at** — true retention over 30 days, what is coming due, and how
  solid the deck is. If retention sits below your target, the cards are usually
  overloaded, not the intervals wrong.
- **Example decks** — **⋯ → Import / export → Example decks**. Reads
  `public/decks/examples/`.

### Keyboard

**Review**

| Key | Does |
| --- | ---- |
| `space` | flip the card |
| `ctrl` + `enter` | check your written recall |
| `1` `2` `3` `4` | again · hard · good · easy |
| `g` | go deeper with the tutor |
| `n` | insight log |
| `s` | where you're at |
| `esc` | close |

**Chat**

| Key | Does |
| --- | ---- |
| `enter` | send |
| `shift` + `enter` | newline |
| `/` | slash commands (at the start of a message) |
| `ctrl` + `k` | command palette — jump to any conversation |
| `ctrl` + `j` | new chat |
| `esc` | close whatever is open |

---

## Card format

```json
{ "name": "ML — Course 1",
  "cards": [ { "tag": "Notation", "q": "<code>m</code>",
               "a": "<p>Number of <strong>training examples</strong>.</p><div class='shape'>m = X.shape[0]</div>" } ] }
```

`q` allows `<code>` and `<strong>`. `a` allows `<p> <strong> <em> <code> <var>
<sub> <sup>`, plus `<div class="formula">` for a centred formula and
`<div class="shape">` for code, array shapes or literal output. Anything
scripty is stripped on import, whatever the source.

**Maths is LaTeX.** A `formula` block holds bare LaTeX; inline maths goes in
single dollars (`$\alpha$`). It is typeset with KaTeX, loaded on demand — a
deck with no maths never downloads it. Cards that arrive in some other shape —
markdown fences, backticks, `\(…\)`, a bare `\frac` in prose — are converted on
the way in by `src/lib/cardFormat.ts`, so a model that ignores the house style
still produces readable cards.

Full spec, including the house style the card writer follows:
[public/decks/README.md](public/decks/README.md).

---

## Project layout

```
index.html            Vite entry point
src/
  main.tsx             mounts <App/>
  App.tsx              boot, then the two views (review is eager, chat is lazy)
  types.ts             shared types for the review half
  types/chat.ts        conversations, turns, variants, context sources
  lib/                 pure logic — no DOM, no React
    util.ts             shared helpers
    config.ts            config layering (defaults -> config.json -> config.local.json)
    fsrs.ts               FSRS-6. Pure: no DOM, no storage, no globals
    seed.ts                the starter deck, embedded so a first run needs no network
    plaintext.ts           markdown -> text. Split from markdown.ts so the review
                            loop does not pull in KaTeX and highlight.js
    markdown.ts             markdown + KaTeX + highlight.js + DOMPurify
    personas.ts             the chat modes and their system prompts
    chatContext.ts          decks/weak cards/notes -> a system-prompt block
    tokens.ts               token estimation and cost formatting
  services/
    storage.ts          review persistence — localStorage today; swap this file
                         if Drill ever grows a real backend
    store.ts             the Drill database: decks, cards, scheduling, stats.
                         A module-level singleton, subscribed to via useDrillStore
    idb.ts               a small promise wrapper over IndexedDB
    chatStore.ts         conversations: CRUD, search, export. Persists to IndexedDB
                         because transcripts are far too big for localStorage
    pricing.ts           per-model pricing, when the backend publishes it
    ai/
      backends.ts         one adapter per inference provider (+ abort, usage)
      index.ts            resolve() + chat() + card writing / marking / titles.
                         This is the file to redirect first if inference ever
                         moves behind a server route
  context/              route, sheet pane, review loop, chat orchestration, toasts
  hooks/                useDrillStore — the React binding onto the store singleton
  components/           the review loop and every sheet pane
    chat/               the chat platform
  styles/
    tokens.css           the design system: two printings, one type/space/radius
                          scale. Nothing downstream spells out a colour or a size
    style.css            the shell, the running head, the page, and every
                          surface shared across all four sections
    views.css            journal + exam            (lazy)
    chat.css             chat                      (lazy)
public/
  decks/examples/       importable decks + index.json
  config.json            committed template — no secrets
  config.local.json      yours, gitignored
tools/                  two tsx scripts for regenerating generated files
vercel.json             build command, output directory, SPA rewrite
```

Routing is a hash router (`#/drill`, `#/chat/<id>`) in ~60 lines rather than a
dependency: two views and a conversation id is the entire routing surface.

**One book, four sections.** Review, Journal, Exam and Chat are chapters of one
document, not four apps: they share a shell (`Shell` > `Sidebar` + `.app-main`
> `.app-scroll` > `.page`), a type scale, a measure and one button system.

The sidebar is that navigation, and it has three states out of one element:
open (17rem), collapsed to a 56px icon rail (remembered in
`Settings.navCollapsed`, toggled by the panel button or ctrl/cmd + B), and —
under 900px — a drawer that slides in over the page. Chat hangs its
conversation index underneath the section list rather than opening a second
sidebar of its own. Because the sidebar and any docked footer are siblings of
the scroll container rather than children of it, no amount of page content can
carry the navigation off the screen.

Two printings — `night` (warm dark, the default) and `day` (warm paper) — are
the same design with the ink and the paper swapped. `Settings.theme` is written
to `:root[data-theme]` by `lib/theme.ts`, and again by a tiny inline script in
`index.html` before first paint so nobody sees the wrong one flash. Everything
downstream composes tokens, so neither printing has a stylesheet of its own.

The chat view is `React.lazy`-loaded. KaTeX and highlight.js are ~450KB, and
the review loop — the thing you open every day — should not pay for them.

**Frontend-only, structured to grow a backend later.** Three files talk to the
outside world: `services/ai` (inference providers), `services/storage.ts`
(review state) and `services/idb.ts` (conversations). If Drill ever needs a
real backend — shared decks, server-side API keys, multi-device sync — those
are the seams: point the two storage modules at a `fetch()`-based API, and/or
add server routes that `services/ai/index.ts` calls instead of hitting
providers directly from the browser. Nothing above them needs to change.

---

## Troubleshooting

**"Could not reach Ollama…"** — either Ollama is not running, or `OLLAMA_ORIGINS`
is not set. See the Ollama section above. Check it is up with
`curl http://localhost:11434/api/tags`.

**404 for `config.local.json` in the console** — normal. Drill probes for the
file and carries on without it. Create `public/config.local.json` and it goes
away.

**Drill looks empty and my cards are gone** — you opened it from a different
origin. `http://localhost:5173` in dev and your deployed URL have separate
stores. Go back to the one you were using. Nothing is deleted.

**"rejected the key (401)"** — wrong key, or the right key for a different
backend. The backend dropdown and the key have to match.

**"404 — usually a model name that does not exist"** — check spelling against
**Load model list**. For Ollama, `ollama pull` it first.

**Card writing returns prose instead of cards** — the model is too small or too
chatty. Try a stronger one; that one job is worth the better model.

**My progress is only in one browser** — that is by design; there is no server.
**⋯ → Import / export → Export everything** writes decks, scheduling, insight
log and settings to one JSON. Progress survives restarts but not clearing site
data. Export now and then.

**My conversations are gone but my cards are fine** — they live in different
stores. Cards are in localStorage; conversations are in IndexedDB, because
transcripts are far larger than localStorage's quota allows. Clearing site data
takes both; a private window has neither. Export a conversation you care about
with `/export`.

**Maths shows as raw `$…$`** — the model wrote it inside a code fence, where it
is left alone deliberately. Ask it to use `$$…$$` on its own line.

---

## Privacy

No telemetry, no analytics, nothing phones home. Your cards and progress live in
your browser's localStorage, your conversations in its IndexedDB, and neither
goes anywhere else. Your API key is stored in the same browser (or in
`config.local.json`, which is gitignored) and is sent only to the backend you
picked. With Ollama or llama.cpp, nothing leaves the machine at all.

One thing worth being explicit about: when you attach deck or insight-log
context to a conversation, those cards and notes are sent to whichever
inference provider that conversation is pointed at. That is the feature working
as intended, but it is your material leaving your machine — if that matters for
what you are studying, point the conversation at Ollama.

---

## Contributing

Backends, decks and bug reports all welcome — see
[CONTRIBUTING.md](CONTRIBUTING.md). Adding a backend is one object in
`src/services/ai/backends.ts` with two methods.

## License

MIT — see [LICENSE](LICENSE).
