/* ============================================================================
 * Ladder — a log-scaled rule showing where this card's interval sits, with
 * four ghosts for where each grade would put it. Makes the scheduler's
 * decision visible instead of asking you to trust a number.
 * ========================================================================== */
import * as FSRS from "@/lib/fsrs";
import * as store from "@/services/store";
import { useReview } from "@/context/ReviewContext";
import { clamp } from "@/lib/util";

const STOPS = [
  { m: 10, l: "10m" },
  { m: 1440, l: "1d" },
  { m: 4320, l: "3d" },
  { m: 10080, l: "1wk" },
  { m: 30240, l: "3wk" },
  { m: 86400, l: "2mo" }
];
const LMIN = Math.log(10);
const LMAX = Math.log(86400);
const GHOST_COLORS = ["var(--red)", "var(--amber)", "var(--accent)", "var(--green)"];
const GHOST_LABELS = ["A", "H", "G", "E"];

function pos(min: number): number {
  if (!min || min <= 0) return 0;
  const t = (Math.log(Math.max(min, 10)) - LMIN) / (LMAX - LMIN);
  return clamp(t, 0, 1) * 100;
}

export default function Ladder() {
  const { current, revealed } = useReview();

  if (!current) return <div className="ladder" hidden></div>;

  const pv = revealed ? FSRS.previewMinutes(current.st, store.params()) : null;
  const markerPos = pos(store.currentInterval(current.st));

  return (
    <div className="ladder">
      <div className="ladder-cap">Next showing</div>
      <div className="ladder-rule" id="rule">
        {STOPS.map((s) => {
          const p = pos(s.m);
          return (
            <div key={s.l}>
              <div className="ladder-stop" style={{ left: p + "%" }}></div>
              <div className="ladder-tick" style={{ left: p + "%" }}>
                {s.l}
              </div>
            </div>
          );
        })}
        {[0, 1, 2, 3].map((i) => {
          const show = !!pv;
          const p = pv ? pos(pv[i]) : 0;
          return (
            <div key={i}>
              <div
                className={"ghost" + (show ? " show" : "")}
                style={{ left: p + "%", background: GHOST_COLORS[i] }}
              ></div>
              <div
                className={"ghost-l" + (show ? " show" : "")}
                style={{ left: p + "%", color: GHOST_COLORS[i] }}
              >
                {GHOST_LABELS[i]}
              </div>
            </div>
          );
        })}
        <div className="marker" style={{ left: markerPos + "%" }}></div>
      </div>
    </div>
  );
}
