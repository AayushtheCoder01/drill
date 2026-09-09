/* ============================================================================
 * SettingsHome — one category at a time, and a way to find which one.
 *
 * What was here before the settings rework was three tabs where the first
 * held fifteen unrelated controls in one column: the theme picker, then the
 * accent swatches, then the API key, then five switches, then the scheduler,
 * then a tutor prompt. Nothing grouped, nothing headed, no order anyone could
 * name, and a Save button at the bottom that applied to seven of the fields
 * and not to the other eight.
 *
 * Now the categories are the navigation, and they are declared once in
 * registry.tsx rather than four times here. Two things stay deliberate:
 *
 *   Conversation is prepended, not bolted on. Opened from a thread, the
 *   settings for *that thread* are the most local scope and belong at the
 *   front of the same list rather than in a separate tab strip — the three
 *   scopes are one inheritance chain (conversation beats project beats
 *   global), and showing them as one list is what makes that legible.
 *
 *   The search box is not decoration. Every category here is one word you
 *   have to guess, and the app has already lost one feature to that: backup
 *   and restore sat in the review loop's Menu while the person who needed it
 *   went looking under Settings. Typing "backup" now lands on it wherever it
 *   ends up living.
 * ========================================================================== */
import { useMemo, useRef, useState } from "react";
import { useDrillStore } from "@/hooks/useDrillStore";
import { useMaybeChat } from "@/context/ChatContext";
import { useSettings } from "@/context/SettingsContext";
import ErrorGuard from "../ui/ErrorGuard";
import Icon from "../ui/Icon";
import { categoriesFor, categoryById, labelOf, matches, type CatId } from "./registry";

export default function SettingsHome() {
  /* Category names and bodies both read the store — the project page is
     called "Personal" in one space and by the project's own name in the
     others — so the navigation has to re-render when it changes. */
  useDrillStore();

  /* "This chat" is offered where there is a chat to configure. Asking the
     context rather than taking a prop means no caller can offer the page in a
     view whose provider is not mounted, which is the version of this that
     throws. */
  const inChat = useMaybeChat() !== null;
  const cats = useMemo(() => categoriesFor({ conversation: inChat }), [inChat]);

  /* The page on screen lives in SettingsContext, not here, so that there is
     one answer to "which category" — the sidebar, a link from another page
     and this navigation all write the same field. Falling back to the first
     available category covers the one case they can disagree: a category
     whose scope this view does not provide. */
  const { cat, open } = useSettings();
  const current = categoryById(cats.some((c) => c.id === cat) ? cat : cats[0].id);

  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);
  const found = useMemo(() => cats.filter((c) => matches(c, query)), [cats, query]);

  function go(id: CatId) {
    open(id);
    setQuery("");
    searchRef.current?.blur();
  }

  return (
    <div className="setpage">
      <div className="setsearch">
        <Icon name="search" size={14} />
        <input
          ref={searchRef}
          className="setsearch-in"
          type="search"
          value={query}
          placeholder="Search settings — try “backup”"
          aria-label="Search settings"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && query) {
              /* Clears the search rather than closing the whole panel, and
                 stops there so the modal's own Escape does not also fire. */
              e.stopPropagation();
              setQuery("");
            }
            if (e.key === "Enter" && found.length) go(found[0].id);
          }}
        />
      </div>

      {query ? (
        /* Searching replaces the pills with the results rather than filtering
           them in place: a pill is one word, and one word is not enough to
           tell you whether the thing you are hunting for is on that page. */
        <div className="setfound" role="listbox" aria-label="Matching settings">
          {found.map((c) => (
            <button key={c.id} className="setfound-row" role="option" aria-selected={false} onClick={() => go(c.id)}>
              <span className="t">{labelOf(c)}</span>
              <span className="s">{c.blurb}</span>
            </button>
          ))}
          {!found.length && (
            <div className="empty">
              Nothing matches “{query}”. Everything Drill keeps is under Data — backup, restore, import and export.
            </div>
          )}
        </div>
      ) : (
        <nav className="setnav" aria-label="Settings sections">
          {cats.map((c) => (
            <button
              key={c.id}
              className={"setnav-btn" + (c.id === current?.id ? " on" : "")}
              aria-current={c.id === current?.id ? "page" : undefined}
              onClick={() => go(c.id)}
            >
              {labelOf(c)}
            </button>
          ))}
        </nav>
      )}

      {/* Keyed on the category so switching pages clears a failure rather
          than leaving the whole panel stuck on the one page that threw. */}
      <div className="setbody">
        <ErrorGuard
          key={current?.id}
          fallback={
            <div className="empty">
              This page could not be drawn. Nothing was changed — pick another category, and the console has the
              details.
            </div>
          }
        >
          {current?.render()}
        </ErrorGuard>
      </div>
    </div>
  );
}
