/* ============================================================================
 * MenuPane — the review loop's own menu, and nothing else.
 *
 * It used to be a second navigation and a fourth settings surface. Half its
 * rows were the sections that are already in the sidebar in every view —
 * Journal, Exam, Chat, Cards — and another row opened the card writer that is
 * the icon immediately to the left of the button you pressed to get here. The
 * rest were app-wide things that existed *only* here, which is how backup and
 * restore, everything the assistant remembers about you, and the transcript of
 * what it just sent all ended up unreachable from five of the six sections.
 *
 * What is left is the two things that belong to a card in front of you, and
 * signposts to where the rest went. The signposts are not decoration: the
 * habit of coming here is real, and a habit that lands on nothing is how a
 * feature gets lost a second time.
 * ========================================================================== */
import * as store from "@/services/store";
import * as candidates from "@/services/candidates";
import { useSheet } from "@/context/SheetContext";
import { useSettings } from "@/context/SettingsContext";
import { useStoreSync } from "@/hooks/useStoreSync";
import SheetShell from "../SheetShell";
import Item from "../ui/Item";
import type { CatId, SectionId } from "@/components/settings/catalogue";

export default function MenuPane() {
  const { open, close } = useSheet();
  const settings = useSettings();
  useStoreSync(candidates);
  const s = store.stats();
  const db = store.get();
  const nPending = candidates.pending(db.activeProjectId).length;

  /* Settings is a panel over the whole app, not a pane in this sheet, so the
     sheet has to get out of the way first — two stacked scrims with the card
     somewhere underneath is nobody's idea of a settings screen. */
  function toSettings(cat?: CatId, at?: SectionId) {
    close();
    settings.open(cat, at);
  }

  return (
    <SheetShell title={db.settings.mix ? "Mixed drilling" : store.deck().name} sub="menu">
      <div className="list">
        <Item
          title="Where you're at"
          sub={`${s.seen} of ${s.cards} seen · ${s.today} reviews today`}
          onClick={() => open({ name: "stats" })}
        />
        <Item
          title="Insight log"
          sub={`${(db.notes || []).length} entries · turn any into cards`}
          onClick={() => open({ name: "notes", card: null })}
        />
      </div>

      <div className="label">In Settings</div>
      <div className="list">
        <Item
          title={nPending ? `Memory · ${nPending} waiting for you` : "Memory"}
          sub="what the assistant knows, what it wants to keep, and what it may keep"
          onClick={() => toSettings("memory", nPending ? "memory.pending" : "memory.store")}
        />
        <Item
          title="What you drill"
          sub="switch deck, mix them, set the size of a run"
          onClick={() => toSettings("review", "review.queue")}
        />
        <Item
          title="Run transcript"
          sub="what every AI call sent and got back"
          onClick={() => toSettings("usage", "usage.transcript")}
        />
        <Item
          title="Backup, import and export"
          sub="one file out, one file back in"
          onClick={() => toSettings("data", "data.backup")}
        />
        <Item title="Everything else" sub="one panel, searchable, from any section  ·  ctrl + ," onClick={() => toSettings()} />
      </div>
    </SheetShell>
  );
}
