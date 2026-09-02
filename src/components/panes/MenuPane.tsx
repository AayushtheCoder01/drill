import * as store from "@/services/store";
import * as chatStore from "@/services/chatStore";
import * as candidates from "@/services/candidates";
import { useSheet } from "@/context/SheetContext";
import { useRoute } from "@/context/RouteContext";
import { useStoreSync } from "@/hooks/useStoreSync";
import SheetShell from "../SheetShell";
import Item from "../ui/Item";

export default function MenuPane() {
  const { open } = useSheet();
  const { openCards, openChat, openJournal, openExam } = useRoute();
  useStoreSync(candidates);
  const s = store.stats();
  const db = store.get();
  const nDecks = store.decksOf(db.activeProjectId).length;
  const nChats = chatStore.list().filter((m) => !m.archived && m.projectId === db.activeProjectId).length;
  const nPending = candidates.pending(db.activeProjectId).length;

  return (
    <SheetShell title={db.settings.mix ? "Mixed drilling" : store.deck().name} sub="menu">
      <div className="list">
        <Item title="Where you're at" sub={`${s.seen} of ${s.cards} seen · ${s.today} reviews today`} onClick={() => open({ name: "stats" })} />
        <Item title="Journal" sub="log the day, get a narrative, distill it into memory and cards" onClick={() => openJournal()} />
        <Item title="Exam" sub="a generated, gradeable test over any window of time" onClick={() => openExam(null)} />
        <Item
          title="Chat"
          sub={
            nChats
              ? `${nChats} conversation${nChats === 1 ? "" : "s"} · knows your decks and weak spots`
              : "ask, explore, and turn any answer into cards"
          }
          onClick={() => openChat(null)}
        />
        <Item title="Make cards with AI" sub="a topic, your notes, anything" onClick={() => open({ name: "ai" })} />
        <Item
          title={nPending ? `Memory tray · ${nPending} pending` : "Memory tray"}
          sub={nPending ? "review what distill proposed" : "nothing waiting right now"}
          onClick={() => open({ name: "candidates" })}
        />
        <Item title="Memory" sub="what the assistant knows about you and this project" onClick={() => open({ name: "memory" })} />
        <Item
          title="Insight log"
          sub={`${(db.notes || []).length} entries · turn any into cards`}
          onClick={() => open({ name: "notes", card: null })}
        />
        <Item title="Cards" sub="every card in this project · search, filter, edit" onClick={() => openCards()} />
        <Item
          title="Decks"
          sub={`${nDecks} deck${nDecks > 1 ? "s" : ""}${db.settings.mix ? " · mixing" : ""}`}
          onClick={() => open({ name: "decks" })}
        />
        <Item title="Import / export" sub="json in, json out · example decks" onClick={() => open({ name: "io" })} />
        <Item title="Run transcript" sub="what every AI call sent and got back" onClick={() => open({ name: "transcript" })} />
      </div>
    </SheetShell>
  );
}
