/* ============================================================================
 * examScope.ts — resolving an exam's scope locally, before any call is made.
 *
 * "test me on what I learned three days ago" has to become a legible count —
 * "14–20 March · 4 entries · 23 cards" — the instant you finish typing, per
 * START-HERE.md §5. This module does that resolution and also assembles the
 * material blob the generation prompt is built from, capped so one huge
 * project can't blow the context window on scope alone.
 * ========================================================================== */
import * as store from "@/services/store";
import * as journalStore from "@/services/journalStore";
import { dayInRange, parseWhen, type WhenRange } from "@/lib/when";
import { stripTags } from "@/lib/util";
import type { ExamScope } from "@/types/exam";
import type { Card } from "@/types";
import type { JournalEntry } from "@/types/journal";

const MAX_CARDS = 80;
const MAX_ENTRIES = 30;

function buildMaterial(entries: JournalEntry[], cards: Card[]): string {
  const parts: string[] = [];
  if (entries.length) {
    parts.push(
      "JOURNAL ENTRIES:\n" +
        entries
          .map((e) => {
            const s = e.summary!;
            return (
              `--- ${e.day} [journal:${e.id}] ---\n${s.narrative}\n` +
              (s.learned.length ? `Learned: ${s.learned.join("; ")}\n` : "") +
              (s.stuck.length ? `Stuck: ${s.stuck.join("; ")}\n` : "") +
              (s.open.length ? `Open: ${s.open.join("; ")}\n` : "")
            );
          })
          .join("\n")
    );
  }
  if (cards.length) {
    parts.push("CARDS:\n" + cards.map((c) => `[card:${c.id}] (${c.tag}) Q: ${stripTags(c.q)} A: ${stripTags(c.a)}`).join("\n"));
  }
  return parts.join("\n\n");
}

function findCard(id: string): Card | null {
  for (const d of Object.values(store.get().decks)) {
    const c = d.cards.find((x) => x.id === id);
    if (c) return c;
  }
  return null;
}

/** Rebuilds the exact same material an exam was generated from, from the ids
 *  frozen in its scope — used by "more questions" / "harder" so extending an
 *  exam replays the same source set rather than re-resolving a date phrase
 *  that might parse differently by the time you ask for more. */
export function materialFromScope(scope: ExamScope): string {
  const entries = scope.journalIds.map((id) => journalStore.get(id)).filter((e): e is JournalEntry => !!e && !!e.summary);
  const cards = scope.cardIds.map(findCard).filter((c): c is Card => !!c);
  return buildMaterial(entries, cards);
}

export interface ScopeInput {
  projectId: string;
  /** Free text, run through lib/when.ts first. Empty means no date filter. */
  when: string;
  manualFrom?: number | null;
  manualTo?: number | null;
  /** Empty means every deck in the project. */
  deckIds: string[];
  /** Empty means every tag. */
  tags: string[];
}

export interface ResolvedScope {
  scope: ExamScope;
  range: WhenRange | null;
  /** True when `when` had text that lib/when.ts could not parse — the
   *  caller should fall back to showing a manual date-range picker. */
  unparsed: boolean;
  entries: JournalEntry[];
  cards: Card[];
  counts: { entries: number; cards: number; decks: number };
  material: string;
}

export function resolveScope(input: ScopeInput): ResolvedScope {
  const whenText = input.when.trim();
  const parsed = whenText ? parseWhen(whenText) : null;
  const unparsed = !!whenText && !parsed;
  const range: WhenRange | null =
    parsed || (input.manualFrom != null && input.manualTo != null ? { from: input.manualFrom, to: input.manualTo, label: "custom range" } : null);

  const allEntries = journalStore.listForProject(input.projectId).filter((e) => e.summary);
  const entries = (range ? allEntries.filter((e) => dayInRange(e.day, range)) : allEntries).slice(0, MAX_ENTRIES);

  const decks = input.deckIds.length ? input.deckIds.map((id) => store.get().decks[id]).filter(Boolean) : store.decksOf(input.projectId);
  let cards: Card[] = [];
  for (const d of decks) cards = cards.concat(d.cards);
  if (input.tags.length) {
    const tagset = new Set(input.tags.map((t) => t.toLowerCase()));
    cards = cards.filter((c) => tagset.has(c.tag.toLowerCase()));
  }
  cards = cards.slice(0, MAX_CARDS);

  const scope: ExamScope = {
    projectId: input.projectId,
    from: range?.from ?? null,
    to: range?.to ?? null,
    label: range?.label || (input.deckIds.length || input.tags.length ? "selected material" : "everything"),
    deckIds: input.deckIds,
    tags: input.tags,
    journalIds: entries.map((e) => e.id),
    cardIds: cards.map((c) => c.id)
  };

  return {
    scope,
    range,
    unparsed,
    entries,
    cards,
    counts: { entries: entries.length, cards: cards.length, decks: decks.length },
    material: buildMaterial(entries, cards)
  };
}
