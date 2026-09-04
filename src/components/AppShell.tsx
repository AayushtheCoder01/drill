import { useEffect } from "react";
import { useDrillStore } from "@/hooks/useDrillStore";
import { useReview } from "@/context/ReviewContext";
import { useSheet } from "@/context/SheetContext";
import Shell from "./Shell";
import Header from "./Header";
import Ladder from "./Ladder";
import Stage from "./Stage";
import Controls from "./Controls";
import Sheet from "./Sheet";
import ReviewRail from "./rail/ReviewRail";

export default function AppShell() {
  const db = useDrillStore(); // subscribe: re-render on every store mutation
  const review = useReview();
  const { pane, open, close } = useSheet();

  // Re-run on mount, and again whenever the active project changes — the
  // queue is scoped to it (store.pool()), so switching projects elsewhere
  // (the running head's ProjectSwitcher) would otherwise leave the old
  // project's card on screen until some other action happened to call
  // refresh().
  useEffect(() => {
    review.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db.activeProjectId]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const t = (e.target as HTMLElement)?.tagName;
      if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT") {
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        return;
      }
      if (pane) {
        if (e.key === "Escape") close();
        return;
      }
      if (e.key === " " || e.key === "Enter") {
        // Space is the review loop's primary key, so it has to do the primary
        // thing. It used to only preventDefault here and leave the reveal to a
        // component that no longer exists, which left the most-pressed key in
        // the app bound to nothing at all. The recall box has its own
        // ctrl+enter for the same job, and is excluded above by the INPUT /
        // TEXTAREA guard, so there is no conflict between the two.
        if (!review.revealed && review.current) {
          e.preventDefault();
          review.reveal();
        }
      } else if (review.revealed && ["1", "2", "3", "4"].indexOf(e.key) >= 0) {
        review.grade((parseInt(e.key, 10)) as 1 | 2 | 3 | 4);
      } else if (e.key === "g" && review.revealed && review.current) {
        open({ name: "chat", card: review.current.def });
      } else if (e.key === "n") {
        open({ name: "notes", card: review.current ? review.current.def : null });
      } else if (e.key === "s") {
        open({ name: "stats" });
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [pane, review, close, open]);

  return (
    /* The grade bar is docked so the answer you are grading and the grade you
       are giving it are never more than a glance apart, however long the card
       runs. Done renders its own call to action inside the page instead, so
       there is nothing to dock when the queue is empty. */
    <Shell current="drill" dock={review.current ? <Controls /> : null} aside={<ReviewRail />} asideLabel="Today">
      <div className="app-scroll">
        <div className="page">
          <Header />
          <Ladder />
          <Stage />
        </div>
      </div>
      <Sheet pane={pane} />
    </Shell>
  );
}
