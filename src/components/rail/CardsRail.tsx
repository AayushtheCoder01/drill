/* ============================================================================
 * CardsRail — the shape of the library, beside the library.
 *
 * The list answers "what is in here"; this answers "what is it made of" —
 * how much has been seen, what the four states split into, and which subjects
 * you have actually written cards about. Built from the same rows the page
 * renders, so the two can never disagree.
 * ========================================================================== */
import { stripTags } from "@/lib/util";
import type { Card, Deck } from "@/types";
import { RailBar, RailEmpty, RailFigure, RailGroup, RailItem, RailList, RailSub } from "./Rail";

interface Row {
  card: Card;
  deck: Deck;
  state: "all" | "due" | "new" | "learning" | "leech";
  ivl: number;
}

export default function CardsRail({
  rows,
  counts
}: {
  rows: Row[];
  counts: Record<"all" | "due" | "new" | "learning" | "leech", number>;
}) {
  const seen = rows.length - counts.new;

  const byTag = new Map<string, number>();
  for (const r of rows) byTag.set(r.card.tag, (byTag.get(r.card.tag) || 0) + 1);
  const tags = [...byTag.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

  const byDeck = new Map<string, number>();
  for (const r of rows) byDeck.set(r.deck.name, (byDeck.get(r.deck.name) || 0) + 1);
  const decks = [...byDeck.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <>
      <RailGroup title="Written down" note={rows.length ? `${Math.round((seen / rows.length) * 100)}%` : undefined}>
        <RailFigure value={rows.length} unit={rows.length === 1 ? "card" : "cards"} muted={rows.length === 0} />
        <RailBar value={seen} max={rows.length} />
        <RailSub>{seen} of them have been seen at least once</RailSub>
      </RailGroup>

      <RailGroup title="Standing">
        {rows.length === 0 ? (
          <RailEmpty>Nothing written yet.</RailEmpty>
        ) : (
          <RailList>
            <RailItem mark={String(counts.due)} text="due now" />
            <RailItem mark={String(counts.learning)} text="scheduled ahead" />
            <RailItem mark={String(counts.new)} text="never seen" />
            <RailItem mark={String(counts.leech)} text="keep slipping" />
          </RailList>
        )}
      </RailGroup>

      <RailGroup title="Subjects" note={byTag.size > 6 ? `${byTag.size} in all` : undefined}>
        {tags.length === 0 ? (
          <RailEmpty>No tags yet.</RailEmpty>
        ) : (
          <RailList>
            {tags.map(([tag, n]) => (
              <RailItem key={tag} mark={String(n)} text={stripTags(tag)} />
            ))}
          </RailList>
        )}
      </RailGroup>

      {decks.length > 1 && (
        <RailGroup title="Decks">
          <RailList>
            {decks.map(([name, n]) => (
              <RailItem key={name} mark={String(n)} text={name} />
            ))}
          </RailList>
        </RailGroup>
      )}
    </>
  );
}
