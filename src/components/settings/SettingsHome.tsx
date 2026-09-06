/* ============================================================================
 * SettingsHome — one category at a time, instead of everything at once.
 *
 * What was here before was three tabs (Global / Project / Usage) where the
 * first one held fifteen unrelated controls in one column: the theme picker,
 * then the accent swatches, then the API key, then five switches, then the
 * scheduler, then a tutor prompt. Nothing grouped, nothing headed, no order
 * anyone could name, and a Save button at the bottom that applied to seven of
 * the fields and not to the other eight.
 *
 * Now the categories are the navigation. Each is a page you can read to the
 * end, in the order the questions actually get asked: can it connect, what do
 * new chats do, how does review behave, what does it look like, what is in
 * this project, what has it cost, where does it all live.
 *
 * Two things stay deliberate about the arrangement:
 *
 *   Connection is first. It is the one category that decides whether the app
 *   does anything at all, and it used to sit two thirds of the way down under
 *   the accent picker.
 *
 *   Conversation is prepended, not bolted on. Opened from a thread, the
 *   settings for *that thread* are the most local scope and belong at the
 *   front of the same list rather than in a separate tab strip — the three
 *   scopes are one inheritance chain (conversation beats project beats
 *   global), and showing them as one list is what makes that legible.
 * ========================================================================== */
import { useState } from "react";
import * as store from "@/services/store";
import { isPersonalProject } from "@/services/projects";
import ProjectScope from "./ProjectScope";
import UsageScope from "./UsageScope";
import ConversationScope from "./ConversationScope";
import Connection from "./sections/Connection";
import ChatPrefs from "./sections/ChatPrefs";
import Review from "./sections/Review";
import Appearance from "./sections/Appearance";
import Data from "./sections/Data";

type Cat = "conversation" | "connection" | "chat" | "review" | "appearance" | "project" | "usage" | "data";

const LABEL: Record<Cat, string> = {
  conversation: "This chat",
  connection: "Connection",
  chat: "Chat",
  review: "Review",
  appearance: "Appearance",
  project: "Project",
  usage: "Usage",
  data: "Data"
};

const ORDER: Cat[] = ["connection", "chat", "review", "appearance", "project", "usage", "data"];

export default function SettingsHome({
  /** Set when the panel was opened from inside a conversation, which adds the
   *  most local scope to the front of the same list. */
  withConversation = false,
  initial
}: {
  withConversation?: boolean;
  initial?: Cat;
}) {
  const cats: Cat[] = withConversation ? ["conversation", ...ORDER] : ORDER;
  const [cat, setCat] = useState<Cat>(initial && cats.includes(initial) ? initial : cats[0]);

  const projectId = store.get().activeProjectId;
  /* The personal space is a project in the database and a place to put loose
     chats everywhere else, so the tab is named for what it is from here. */
  const projectLabel = isPersonalProject(projectId) ? "Personal" : LABEL.project;

  return (
    <div className="setpage">
      <nav className="setnav" aria-label="Settings sections">
        {cats.map((c) => (
          <button
            key={c}
            className={"setnav-btn" + (c === cat ? " on" : "")}
            aria-current={c === cat ? "page" : undefined}
            onClick={() => setCat(c)}
          >
            {c === "project" ? projectLabel : LABEL[c]}
          </button>
        ))}
      </nav>

      <div className="setbody">
        {cat === "conversation" && <ConversationScope />}
        {cat === "connection" && <Connection />}
        {cat === "chat" && <ChatPrefs />}
        {cat === "review" && <Review />}
        {cat === "appearance" && <Appearance />}
        {cat === "project" && <ProjectScope projectId={projectId} />}
        {cat === "usage" && <UsageScope />}
        {cat === "data" && <Data />}
      </div>
    </div>
  );
}
