# Deck format

A deck is one JSON file. No schema version, no metadata block, nothing you have
to keep in sync — just a name and a list of cards.

```json
{
  "name": "Maths foundations for ML",
  "cards": [
    {
      "id": "mf5",
      "tag": "Vectors",
      "q": "Write the dot product <code>x · y</code>.",
      "a": "<div class='formula'>\\vec{x} \\cdot \\vec{y} = \\sum_{i=1}^{n} x_i y_i</div>"
    }
  ]
}
```

Drill also accepts a bare array — `[{...}, {...}]` — if you would rather not
name the deck. It will ask you for a name on import.

## Fields

| Field  | Required | What it is |
| ------ | -------- | ---------- |
| `name` | no       | Deck name. Missing means Drill prompts for one. |
| `id`   | no       | Stable card id. Keep it and a re-import lands on your existing scheduling instead of starting the card over. Omit it and Drill generates one. |
| `tag`  | no       | Section name, up to 44 characters. Interleaving works by keeping consecutive cards from *different* tags, so tags are what make a deck drillable rather than just storable. Defaults to `General`. |
| `q`    | **yes**  | The front. The prompt to recall. |
| `a`    | **yes**  | The back. The shortest thing that rebuilds the idea. |

Scheduling is never stored in a deck file. Progress lives separately in your
browser, keyed by card id, so you can hand someone a deck without handing them
your review history — and re-import a corrected deck without losing yours.

## Allowed HTML

Everything else is stripped on import. `<script>`, `<iframe>`, `<form>`,
`<style>`, inline `on*` handlers and `javascript:` URLs never survive, whether
the card came from a file, the clipboard or a language model.

**Front (`q`)** — `<code>`, `<strong>`

**Back (`a`)** — `<p>`, `<strong>`, `<em>`, `<code>`, `<var>`, `<sub>`, `<sup>`,
plus two block helpers:

```html
<div class="formula">J(w,b) = \frac{1}{2m} \sum_{i=0}^{m-1} \left( f(x^{(i)}) - y^{(i)} \right)^2</div>
```
A centred formula. Its contents are **LaTeX**, written bare — no `$`
delimiters, because the element already means "this is maths". It is typeset
with KaTeX, which is loaded on demand, so a deck with no maths never downloads
it. Use it for the one equation the card is about.

For maths inside a sentence, wrap it in single dollars:

```html
<p>The learning rate $\alpha$ sets the step size.</p>
```

**Write every fraction as `\frac`.** `1/2m`, `<sup>1</sup>&frasl;<sub>2m</sub>`
and unicode superscripts all render as a cramped line of symbols that has to be
decoded rather than read, which is the opposite of what a card is for.

A card that arrives in some other shape is repaired rather than rejected:
`src/lib/cardFormat.ts` runs on every card entering the store and converts
markdown code fences, `` `backticks` ``, `\(…\)` and `\[…\]`, and bare LaTeX
sitting in prose into the format above. It is deliberately conservative — it
will not guess that `2/3` in a sentence is a fraction — so writing LaTeX
yourself is still the way to get exactly what you meant.

```html
<div class="shape">X.shape  ->  (m, n)
w.shape  ->  (n,)</div>
```
Monospaced, and **newlines are preserved literally**. For code, array shapes,
or program output. Do not indent the closing tag — the whitespace shows.

Single or double quotes on the `class` attribute both work. Single quotes save
you escaping them inside JSON.

## House style

The example decks follow these, and so does the card writer in the app. They
are not arbitrary — each one is the difference between a card you keep and a
card you end up deleting.

- **One idea per card.** If the card needs the word "and", it is probably two
  cards. This is the minimum information principle, and it is the single thing
  that decides whether a card survives six months.
- **The front is a prompt, not a quiz.** Often just a symbol, or "write the
  formula for…", or "why does this work?". Never multiple choice — recognition
  is not what you are training.
- **The back leads with the answer**, then at most one line on why it matters or
  the trap people fall into, wrapped in `<em>`.
- **Favour why-questions**, what-breaks-if-not, and tracing shapes over plain
  definitions. A definition you can look up. A mechanism you cannot.
- Plain prose. No filler, no praise, no exclamation marks.

## Example decks

`examples/index.json` lists what is in this folder. The **Example decks**
browser in the app fetches it from `/decks/examples/index.json` at runtime.

If you add a deck here, regenerate the index:

```bash
npm run deck:index
```

`examples/ml-course1.json` is generated from `src/lib/seed.ts`, which is the
copy Drill embeds so that a first run works with no network at all. Edit the
seed, not the JSON, then:

```bash
npm run seed:json
```

## Contributing a deck

Decks are welcome — see [CONTRIBUTING.md](../../CONTRIBUTING.md). In short: keep
it under a few hundred cards, follow the house style above, put it in
`public/decks/examples/`, and regenerate the index.
