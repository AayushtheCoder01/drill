import * as store from "@/services/store";
import { useSheet } from "@/context/SheetContext";
import { useSettings } from "@/context/SettingsContext";
import SheetShell from "../SheetShell";
import Bars from "../ui/Bars";

export default function StatsPane() {
  const { open, close } = useSheet();
  const settings = useSettings();
  const s = store.stats();
  const ret = s.rev ? Math.round((s.ok / s.rev) * 100) : null;

  /* The low-retention case names a dial, so it takes you to it. A readout
     that says "try a higher target in Settings" and leaves you to find which
     of nine pages holds it is half a sentence. */
  const hint =
    ret === null
      ? "Retention shows up once you have reviews on scheduled cards."
      : ret >= 95
      ? "Above your target — the scheduler will stretch intervals out."
      : ret >= 85
      ? "Right where FSRS aims. Leave it alone."
      : "Below target. Either the cards are overloaded (split them) or the intervals are too long.";

  return (
    <SheetShell title="Where you're at" sub={store.settings().mix ? "all decks" : store.deck().name}>
      <div className="statgrid">
        <div className="statbox">
          <div className="bignum">{ret === null ? "—" : ret + "%"}</div>
          <div className="bigsub">true retention · 30d</div>
        </div>
        <div className="statbox">
          <div className="bignum">{s.today}</div>
          <div className="bigsub">reviews today</div>
        </div>
      </div>

      <label className="f">Coming due</label>
      <Bars vals={s.fc} labels={["now", "+1", "+2", "+3", "+4", "+5", "+6"]} />

      <label className="f">How solid it is (memory strength)</label>
      <Bars vals={s.bands} labels={["&lt;1d", "1-7d", "1-3wk", "3wk-3mo", "3mo+"]} />

      <div className="row">
        <span>Cards seen</span>
        <span>
          {s.seen} / {s.cards}
        </span>
      </div>
      <div className="row">
        <span>Reviews, last 7 days</span>
        <span>{s.last7}</span>
      </div>
      <div className="row">
        <span>Graded in review state, 30d</span>
        <span>{s.rev}</span>
      </div>
      <div className="row">
        <span>Leeches</span>
        <span>{s.leech}</span>
      </div>

      <div className="hintline stat-hint">
        {hint}
        {ret !== null && ret < 85 && (
          <>
            {" "}
            <button
              className="textlink"
              onClick={() => {
                close();
                settings.open("review", "review.scheduling");
              }}
            >
              Raise the target retention
            </button>
            .
          </>
        )}
      </div>

      {s.leech > 0 && (
        <div className="btnrow stat-hint">
          <button className="btn sm danger" onClick={() => open({ name: "library", filter: "", mode: "leech" })}>
            See the {s.leech} leeches
          </button>
        </div>
      )}
    </SheetShell>
  );
}
