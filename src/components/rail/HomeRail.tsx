/* ============================================================================
 * HomeRail — the home page's instrument panel.
 *
 * The page itself is the long view: a year of days, totals, doors. The rail
 * is the short one — this week, the best day on record, and the last thing
 * touched in each section, so you can see the shape of the current run
 * without scrolling the year.
 *
 * Built from the same Rail vocabulary as the other four, and from the same
 * project-scoped log the page draws, so the two can never disagree.
 * ========================================================================== */
import * as store from "@/services/store";
import * as journalStore from "@/services/journalStore";
import * as examStore from "@/services/examStore";
import { countsByDay, streaks } from "@/lib/activity";
import { DAY, ago, dayKey } from "@/lib/util";
import type { LogEntry } from "@/types";
import { RailEmpty, RailFigure, RailGroup, RailItem, RailList, RailSub, RailWeek } from "./Rail";

export default function HomeRail({ log, projectId }: { log: LogEntry[]; projectId: string }) {
  const counts = countsByDay(log);
  const midnight = new Date().setHours(0, 0, 0, 0);

  const week: boolean[] = [];
  let weekTotal = 0;
  for (let i = 6; i >= 0; i--) {
    const n = counts.get(dayKey(midnight - i * DAY)) || 0;
    week.push(n > 0);
    weekTotal += n;
  }

  const { current, longest } = streaks(log);
  const best = Math.max(0, ...counts.values());
  const decks = store.decksOf(projectId);
  const journal = journalStore.listForProject(projectId);
  const exams = examStore.listForProject(projectId);

  return (
    <>
      <RailGroup title="This week" note={`${weekTotal}`}>
        <RailWeek days={week} />
        <RailSub>
          {weekTotal === 0
            ? "nothing reviewed in seven days"
            : `${weekTotal} review${weekTotal === 1 ? "" : "s"} across ${week.filter(Boolean).length} day${
                week.filter(Boolean).length === 1 ? "" : "s"
              }`}
        </RailSub>
      </RailGroup>

      <RailGroup title="Streak" note={longest > 0 ? `best ${longest}` : undefined}>
        <RailFigure value={current} unit={current === 1 ? "day" : "days"} muted={current === 0} />
        <RailSub>{current === 0 ? "review anything today to start one" : "consecutive days with a review"}</RailSub>
      </RailGroup>

      <RailGroup title="Best day">
        {best === 0 ? (
          <RailEmpty>No reviews logged yet.</RailEmpty>
        ) : (
          <>
            <RailFigure value={best} unit="cards" />
            <RailSub>the most you have done in one day</RailSub>
          </>
        )}
      </RailGroup>

      <RailGroup title="Latest">
        <RailList>
          {journal[0] && <RailItem mark="jrnl" text={`${journal[0].day} · ${ago(journal[0].updated)}`} />}
          {exams[0] && <RailItem mark="exam" text={`${exams[0].title} · ${ago(exams[0].created)}`} />}
          {decks[0] && <RailItem mark="deck" text={`${decks.length} deck${decks.length === 1 ? "" : "s"} in this project`} />}
          {!journal[0] && !exams[0] && !decks[0] && <RailItem text="Nothing here yet." />}
        </RailList>
      </RailGroup>
    </>
  );
}
