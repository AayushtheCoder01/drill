/* ============================================================================
 * HomeRail — the home page's instrument panel.
 *
 * The page itself is the long view: a year of days, totals, doors. The rail
 * is the short one — this week, the best day on record, and the last thing
 * touched in each section, so you can see the shape of the current run
 * without scrolling the year.
 *
 * Built from the same Rail vocabulary as the other four, and from the same
 * activity map the page draws, so the two can never disagree — including
 * about what counts as a day, which is now anything at all rather than a card
 * graded.
 * ========================================================================== */
import * as store from "@/services/store";
import * as journalStore from "@/services/journalStore";
import * as examStore from "@/services/examStore";
import { describeDay, streaks, today as todayOf, week as weekOf, type DayActivity } from "@/lib/activity";
import { ago } from "@/lib/util";
import { RailEmpty, RailFigure, RailGroup, RailItem, RailList, RailSub, RailWeek } from "./Rail";

export default function HomeRail({ days, projectId }: { days: Map<string, DayActivity>; projectId: string }) {
  const { active, total: weekTotal } = weekOf(days);
  const { current, longest } = streaks(days);
  const today = todayOf(days);

  let best = 0;
  for (const d of days.values()) if (d.total > best) best = d.total;

  const decks = store.decksOf(projectId);
  const journal = journalStore.listForProject(projectId);
  const exams = examStore.listForProject(projectId);

  return (
    <>
      <RailGroup title="Today" note={today.total ? `${today.total}` : undefined}>
        {today.total === 0 ? (
          <RailEmpty>Nothing logged yet today.</RailEmpty>
        ) : (
          <>
            <RailFigure value={today.total} unit={today.total === 1 ? "thing" : "things"} />
            <RailSub>{describeDay(today, 3)}</RailSub>
          </>
        )}
      </RailGroup>

      <RailGroup title="This week" note={`${weekTotal}`}>
        <RailWeek days={active} />
        <RailSub>
          {weekTotal === 0
            ? "nothing logged in seven days"
            : `${weekTotal} thing${weekTotal === 1 ? "" : "s"} across ${active.filter(Boolean).length} day${
                active.filter(Boolean).length === 1 ? "" : "s"
              }`}
        </RailSub>
      </RailGroup>

      <RailGroup title="Streak" note={longest > 0 ? `best ${longest}` : undefined}>
        <RailFigure value={current} unit={current === 1 ? "day" : "days"} muted={current === 0} />
        <RailSub>
          {current === 0 ? "anything at all today starts one" : "consecutive days with something on them"}
        </RailSub>
      </RailGroup>

      <RailGroup title="Best day">
        {best === 0 ? (
          <RailEmpty>Nothing logged yet.</RailEmpty>
        ) : (
          <>
            <RailFigure value={best} unit="things" />
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
