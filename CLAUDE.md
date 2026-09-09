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
npm test        # tsx --test src/**/*.test.ts
                # 124 tests: fsrs, cardFormat, memory*, effort, title,
                # thinking, agent/loop, settings/catalogue
npm run build   # tsc -b && vite build
```

**A dev server's port is part of its origin.** `localhost:5173` and
`localhost:5174` have entirely separate `localStorage` and IndexedDB, so a
second `npm run dev` while one is already running gives you a *fresh empty
app*, not the data you were just looking at. Convenient for testing against
throwaway state; alarming for ten seconds if you do not know it.

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

**There is one project that is not a project.** `#/p/personal` is the space for
chats that belong to no body of work — the ChatGPT-shaped default, next to the
projects rather than inside them. It is a real `Project` record with a literal
id rather than a nullable `projectId`, deliberately: `projects[c.projectId]` is
read in a dozen places and a null there is how you white-screen this app. What
makes it a space and not a project is presentation only — `projects.list()`
leaves it out (read it with `projects.personal()`), the switcher gives it its
own row with no edit or archive, `archiveProject` refuses it, and
`switchProject` lands it on chat. `lib/migrate.ts` creates it, so a restored
backup from before it existed comes back with it.

**Every project is guaranteed a deck of its own, and that is load-bearing.**
`deck()` is read as non-null in a dozen components and `pool()` returns
`[deck()]`. `ensureActiveDeck()` in `store.ts` is the single place that keeps
the promise; the fallback it replaced reached outside the project
(`Object.keys(db.decks)[0]`), so a project with no decks — which is every
project `createProject` has ever made — showed and drilled another project's
cards. Never widen that fallback past `decksOf(activeProjectId)`.

**A crash in `Shell`/`Sidebar` white-screens the whole app.** There is no
error boundary above them, and `Sidebar` now calls `store.counts()` and
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
is the published promise about all of them: `Shell.tsx` (ctrl+B, ctrl+\, ctrl+,
`?`, Escape), `AppShell.tsx` (the review loop: Space, 1–4, G, N, S — all guarded
to not fire while an INPUT/TEXTAREA/SELECT has focus, *or* while settings is
open, since it covers the card it would otherwise grade), and
`ChatView`/`Composer` (ctrl+K, ctrl+J, Enter to send, `/`, `@`, Escape).
**Change a binding, change the modal in the same commit.** A cheatsheet row that
nothing listens for is worse than no row.

Escape is layered, innermost first, and `Shell` owns the outermost layer:
settings, then the shortcuts sheet, then the mobile drawer. `ChatView`
deliberately does *not* handle Escape for settings — if it did, closing the
panel from chat would also clear the message you were writing.

**One composer control is model-dependent, not backend-dependent.** Everything
else in the app asks "can this backend do it"; thinking asks "can this *model*
do it", because one OpenRouter key reaches both kinds and the model chip is one
click away. The answer comes from OpenRouter's `supported_parameters`, which
`services/pricing.ts` already fetches — one catalogue call answers both "what
does it cost" and "can it think". `lib/thinking.ts` turns that into three
states, and the third matters: **not knowing leaves the switch live**. Rounding
`unknown` down to "no" would grey the control out for every local model and for
everybody until the catalogue lands. Only a catalogue hit produces a "no".
Ask `availability(id, supports, model)` in `lib/chatActions.ts` — never
`backend.supports` directly — because the send path filters on the same call
and the two must not disagree.

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

**Chat has three modes, and one of them is an agent loop.** `Conversation.mode`
is `direct` (one call, the default) / `agent` (reactive lookups) / `deep` (plan
first, close every step, then answer). The loop lives in `services/agent/` —
read `tools.ts`'s header before touching the catalogue, and START-HERE §13 for
the whole picture. Four things bite:

- **`loop.ts` takes `chat` *and* `runTool` injected.** That is the only reason
  its 28 tests run with no API key and no IndexedDB. Do not "simplify" it by
  importing them.
- **Never put a literal tool name in a prompt string.** One did, survived the
  rename that deleted that tool, and taught every local model to call something
  that did not exist. Derive it from the catalogue.
- **Effort is read by every mode; `agentSteps` only means something in
  `agent`/`deep`.** `EffortBudget.blurb` must stay mode-neutral;
  `effortMeans(effort, mode)` is the only thing that phrases the lookup budget,
  and `effort.test.ts` enforces it.
- **Anything settable before a conversation exists needs a draft.**
  `ChatContext.update()` returns early with no conversation, so a new
  per-conversation control silently does nothing on the empty chat screen until
  it gets a `draft*` beside `draftModel` / `draftEffort` / `draftMode` /
  `draftActions` — and until `withDrafts()` emits it, which is what every
  creation path (send, starters, slash commands, ctrl+J) funnels through.
  `withDrafts` reads a ref, not state, because ChatView's ctrl+J listener is
  re-registered only when the palette or drawer moves and otherwise holds a
  first-render closure.

**There is still no error boundary at the root.** A render crash in `Shell`,
`Sidebar`, or a composer chip rendered before its new prop was threaded through
white-screens the whole app. That happened for real while building Phase 12.
`components/ui/ErrorGuard.tsx` is the local version — the sheet router and the
settings body wrap themselves in it, so a pane or a settings page that throws
costs you that panel rather than the session. Wrap anything that renders data
it did not create; it does not help with a crash above it.

## Verifying

There is **no API key in this environment**, so live inference, real streaming,
the abort path and real token/cost accounting cannot be tested. Say so plainly
rather than implying they were. **The agent loop has never run against a real
model** — whether it picks good tools is the open question, and the first thing
to try when a key exists. Everything else can be driven directly:

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
- **`el.blur()` fires no `focusout`**, so a React `onBlur` handler never runs
  and a commit-on-blur field looks like it silently drops the edit. `el.focus()`
  does work — `document.activeElement` confirms it — which makes this
  convincing. Dispatch `new FocusEvent("focusout", {bubbles: true})` by hand.

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
  persisted and wired to nothing is a bug, not a placeholder — and so is the
  inverse, which this app has now produced three times: `settings.effort` and
  `settings.autonomy` were the bottom of an inheritance chain the send path
  read while no global control existed, and `settings.sessionSize` was read by
  the rail and by `startSession()` with nothing anywhere able to write it.
  There is a third shape, and it is the one this repo keeps hitting: a real
  control, wired to a real value, in a surface five of the six sections do not
  mount. `settings.mix` was that one.
- **Settings commit on blur. There is no Save button.** There used to be one,
  and it applied to seven of the fifteen controls on the screen while the rest
  wrote through immediately, with nothing saying which was which — so editing
  a number and closing the panel silently discarded it. `ui/TextRow.tsx` is
  the field that keeps the rule; do not add a field that batches into a Save.
- **One settings surface, and it is not a view.** `context/SettingsContext.tsx`
  holds which page is open and, optionally, which group on it to jump to;
  `Shell` renders `settings/SettingsSurface.tsx` once, so the same panel with
  the same navigation appears in all six sections (`ctrl + ,`, the sidebar,
  chat's header button, the review Menu). It is mounted from `Shell` rather
  than the app root deliberately — that is what puts it inside `ChatProvider`
  in chat, so the "This chat" page has a conversation to read. Conversation,
  project and global are one inheritance chain, so they read as one list
  rather than three tab strips.
- **The table of contents is `settings/catalogue.ts`, and it is pure data.**
  Every page and every group on it — name, blurb, and the words search matches
  — is declared there once. `registry.tsx` holds only the half that cannot be
  data (the component to render). `Section` takes a catalogued `id` and reads
  its own heading from it, so a group's words cannot drift from the words that
  find it, and `catalogue.test.ts` fails the build if a page has no groups or a
  group names a page that does not exist. **Add a control, add to that group's
  `finds`** — search returns the *group*, scrolls to it and marks it, and it is
  the second line of defence against the failure that put backup and restore in
  the review loop's Menu, where five of six sections could not reach it.
- **A section's own menu is for that section.** Anything worth opening from
  chat, home, the journal or the exam view is a Settings page, not a pane —
  the review loop's Menu was where backup, the memory browser, the memory tray
  and the run transcript all ended up, which meant they existed from exactly
  one of the six sections. `SheetContext`'s `PaneState` union is the fence:
  a pane is a *review* dialog, and only the review loop mounts a
  `SheetProvider`. What is left in that menu is two review things and
  signposts. Settings pages reach `useMaybeReview()` rather than `useReview()`
  because settings opens far outside the review loop.
- **Two shapes of one rail, at 860px.** Wide, the settings rail is a grouped
  column beside the page, and only the page scrolls — `.set-host` exists
  instead of `.sheet-body` precisely so the search box and the rail stay put.
  Narrow, the identical markup is the row of pills it used to be
  (`.setnav-group { display: contents }`). Do not add a third.
