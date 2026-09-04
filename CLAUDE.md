# Drill — working notes for a new session

Read this first. It is the orientation map, not the documentation: it says
where things are, what will bite you, and how to check your work. The prose
docs are better than a summary of them, so this points at them instead.

| You want | Read |
| --- | --- |
| What the app is, every feature, full file map, setup per backend | `README.md` |
| The rules of the codebase, what a good change looks like | `CONTRIBUTING.md` |
| Why the app is shaped this way, the roadmap, locked decisions | `START-HERE.md` |

`README.md` is the user-facing product doc and is accurate and detailed —
especially its **Project layout** section. Do not restate it here.

---

## Commands

```bash
npm run dev     # vite; usually :5173, falls back to :5174 if taken
npm run lint    # tsc --noEmit. The only lint there is
npm test        # tsx --test src/**/*.test.ts  (66 tests: fsrs, cardFormat, memory*)
npm run build   # tsc -b && vite build
```

Before saying a change is done: `npm run lint && npm test && npm run build`,
and then **look at it in the browser**. See *Verifying* below — this codebase
is almost entirely UI, and three of the last set of bugs typechecked cleanly
and were still completely broken.

## Shape, in one paragraph

Vite + React 18 + TypeScript, frontend-only, no server, no account, no
telemetry. State lives in two module-level singletons that components
subscribe to with `useSyncExternalStore` — `services/store.ts` (decks, cards,
scheduling, projects, settings; persisted to `localStorage` under
`mldrill:v3`) and the IndexedDB-backed stores (`chatStore`, `journalStore`,
`memoryStore`, `examStore`, `candidates`, `usageLog`) in the `drill-chat`
database. `useDrillStore()` binds the first; `useStoreSync(mod)` binds any of
the others. Routing is a ~60-line hash router: `#/p/<projectId>/<view>`, plus
`#/p/<projectId>/chat/<conversationId>`.

## Things that will cost you an hour if you don't know them

**One shell, six sections.** Home, Review, Cards, Journal, Exam and Chat all
render inside `components/Shell.tsx`. The sidebar, the dock and the rail are
*siblings* of the scroll container, never inside it — that is what stops the
navigation scrolling off the page, and it is a rule, not an accident. Putting
navigation inside `.app-scroll` reintroduces a bug this shell was built to
kill.

**A crash in `Shell`/`Sidebar` white-screens the whole app.** There is no
error boundary, and `Sidebar` now calls `store.counts()` and
`journalStore.unrolledEntries()` on every render in every view. Anything those
touch is effectively a global dependency. Note `store.pool()` returns
`[deck()]` when deck-mixing is off, and `deck()` is `db.decks[db.active]` — an
unresolvable `db.active` yields `[undefined]` and takes down every view at
once, not just Review.

**Tokens only, in the stylesheets.** `styles/tokens.css` owns every colour,
size, radius, shadow and easing, in two printings (`night` default, `day`).
Nothing downstream spells out an `oklch()` or a pixel size, and there is
exactly one label style (`.label`). New styles go in the stylesheet for the
section, not in a `style={{...}}` prop — a component may set a *measured*
value inline (a grid column, a computed `left`), never a look.

**Stylesheets are code-split on purpose.** `style.css` and `tokens.css` load
eagerly from `main.tsx`; `cards.css`, `home.css`, `chat.css` and `views.css`
are imported by the view that needs them so they ride that lazy chunk.
`ChatView` is `React.lazy` because KaTeX + highlight.js are ~450KB and the
review loop is opened every day. Never import chat's rendering stack from
anything the review loop touches — that is what `lib/plaintext.ts` exists for,
as the KaTeX-free counterpart to `lib/markdown.ts`.

**Never string-splice HTML into rendered output.** Walk the DOM. Everything
user- or model-supplied goes through `lib/markdown.ts` (DOMPurify) first.

**Keyboard bindings live in three places** and `components/ui/ShortcutsModal.tsx`
is the published promise about all of them: `Shell.tsx` (ctrl+B, ctrl+\, `?`,
Escape), `AppShell.tsx` (the review loop: Space, 1–4, G, N, S — all guarded to
not fire while an INPUT/TEXTAREA/SELECT has focus), and `ChatView`/`Composer`
(ctrl+K, ctrl+J, Enter to send, `/`, `@`, Escape). **Change a binding, change
the modal in the same commit.** A cheatsheet row that nothing listens for is
worse than no row.

**Backends and credentials.** `services/ai/backends.ts` holds one entry per
provider — OpenRouter, Groq, Ollama, and a generic OpenAI-compatible one — and
anything speaking the OpenAI wire format needs only headers, via
`openAICompatible()`. Two rules that are easy to miss:

- Each entry declares `pricing: "catalogue" | "free" | "unpriced"`, and
  `services/pricing.ts` reads that rather than checking backend ids. Omitting
  it means "unpriced", which is deliberate — a new backend must opt in to
  claiming a price instead of inheriting a `$0` that isn't true.
- `key`/`model`/`baseUrl` are single live fields, mirrored per backend into
  `Settings.creds`. **Only `store.setBackend()` may change `settings.backend`**
  — it stashes the outgoing backend's three fields and restores the incoming
  one's. Assigning `backend` through `updateSettings` skips that and silently
  destroys a key. `RETIRED_BACKENDS` in `store.ts` is how a removed provider
  is retired without deleting the secret its user pasted.

**Singleton components with entity-scoped state need a `key`.** `Composer` is
keyed on the conversation id because otherwise a draft leaks between threads.

## Verifying

There is **no API key in this environment**, so live inference, real streaming,
the abort path and real token/cost accounting cannot be tested. Say so plainly
rather than implying they were. Everything else can be driven directly:

- Seed state and drive the DOM with the browser tools against `npm run dev`.
  `store` state is `localStorage["mldrill:v3"]`; conversations are the
  `conversations` + `meta` object stores of the `drill-chat` IndexedDB (v4).
  **`db.decks` and `db.projects` are `Record<id, T>`, not arrays** — seeding an
  array there dangles `db.active` and white-screens the app.
- **Clean up seeded data afterwards.** Deleting decks or re-keying a project
  orphans real conversations, which reference `projectId`; the app will happily
  bootstrap a fresh project and starter deck over the top of the user's own.
- Assert on measured DOM values, not screenshots. Screenshots crop and rescale.

### Browser-tool artifacts that look exactly like bugs

The driven tab is `visibilityState: "hidden"`, and that changes real behaviour:

- **`requestAnimationFrame` never fires** and scroll events are not dispatched
  at all. A rAF-driven readout that "does nothing" is usually this. Shim
  `window.requestAnimationFrame` to a timer and remount via the hash router
  (no reload, so the shim survives), then dispatch `new Event("scroll")` by
  hand. `setTimeout` is also clamped to ~1s in the background, so wait longer
  than feels necessary.
- **CSS transitions and animations freeze mid-flight**, so a computed value
  reads as the *previous* state. Inject `* { transition: none !important }`
  before measuring.
- `scrollIntoView({behavior:"smooth"})` is silently dropped. Use `"auto"`.
- The viewport maxes at **1131 CSS px** (150% Windows scaling); `outerWidth`
  lies. Do not put a desktop breakpoint above ~1100px. Test other widths by
  driving the app inside a sized same-origin iframe.
- A page-level `transform: scale()` used to fit a screenshot corrupts every
  `getBoundingClientRect()` measurement. Clear it before measuring.

### React 18 StrictMode is on

Effects mount, clean up, and mount again. Any cleanup that cancels a pending
handle **must also clear the handle**, or the second mount sees a stale
non-zero guard and the work is never scheduled again. And an effect whose
element is conditionally rendered needs that condition in its dependency
array: `.msgs` does not exist on the first render of a conversation opened
straight from its URL, so an effect keyed only on the conversation id attaches
its listener to nothing and never runs again.

## Conventions

- **Comments explain *why*.** The existing ones are unusually good — they
  record the bug a rule exists to prevent. Match that register: full
  sentences, the reason rather than the restatement. Do not strip them.
- Commit straight to `main`. No branches, no PRs on this repo.
- No new runtime dependencies without a reason that survives
  `CONTRIBUTING.md`'s "deliberately not here" list.
- Settings must actually be read by something. A dial that is editable,
  persisted and wired to nothing is a bug, not a placeholder.
