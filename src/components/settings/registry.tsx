/* ============================================================================
 * registry.tsx — the settings table of contents, declared once.
 *
 * The category list used to be spelled out four times inside SettingsHome: a
 * string union, a LABEL record, an ORDER array, and a render switch. Adding a
 * page meant getting all four right, and getting three of them right gave you
 * a page that was either unreachable or unlabelled. There is one list now,
 * and everything that walks the settings — the navigation, the search, the
 * body — walks this.
 *
 * `keywords` is the part that is easy to let rot, so it is worth saying what
 * it is for. Settings is only as good as its findability: the backup and
 * restore that moves a browser's worth of work to another browser lived in
 * the review loop's Menu for months, and the person who needed it went
 * looking in Settings, which is where it should have been. Search is the
 * second line of defence against that. When you add a control to a page, add
 * the word someone would type to find it.
 * ========================================================================== */
import type { ReactNode } from "react";
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

export type CatId =
  | "conversation"
  | "connection"
  | "chat"
  | "review"
  | "appearance"
  | "project"
  | "usage"
  | "data";

export interface Category {
  id: CatId;
  /** A function where the name depends on state: the project page is called
   *  "Personal" in the space that is not a project. */
  label: string | (() => string);
  /** The sentence under the name in search results, and matched by search. */
  blurb: string;
  /** What someone would type looking for something on this page. */
  keywords: string[];
  /** A category whose content needs a context only one view mounts. The
   *  conversation page reads ChatProvider, so it is offered in chat and
   *  nowhere else rather than offered everywhere and empty in five views. */
  needs?: "conversation";
  render: () => ReactNode;
}

/* Order is the order the questions get asked. Connection first because it is
   the one page that decides whether the app does anything at all; Data last
   because it is the one you come back for. */
export const CATEGORIES: Category[] = [
  {
    id: "conversation",
    label: "This chat",
    blurb: "Model, persona, sampling and what this one thread can see.",
    keywords: [
      "conversation", "thread", "persona", "mode", "system prompt", "instructions",
      "temperature", "sampling", "max tokens", "reply limit", "context", "attach deck",
      "memory retrieval", "model", "backend", "effort"
    ],
    needs: "conversation",
    render: () => <ConversationScope />
  },
  {
    id: "connection",
    label: "Connection",
    blurb: "Where inference runs, and the credential to get there.",
    keywords: [
      "api key", "key", "token", "credential", "secret", "openrouter", "groq", "ollama",
      "openai", "compatible", "backend", "provider", "base url", "endpoint", "model",
      "default model", "test connection", "local", "config"
    ],
    render: () => <Connection />
  },
  {
    id: "chat",
    label: "Chat",
    blurb: "What every new conversation starts from, and what may be remembered.",
    keywords: [
      "effort", "reasoning", "follow-ups", "followups", "suggestions", "auto title",
      "naming", "memory", "autonomy", "remember", "defaults"
    ],
    render: () => <ChatPrefs />
  },
  {
    id: "review",
    label: "Review",
    blurb: "How a card is answered, how often it comes back, how the tutor talks.",
    keywords: [
      "recall", "write it", "flip", "marking", "grade", "interleave", "fsrs",
      "retention", "scheduling", "new per day", "interval", "tutor", "language",
      "hinglish", "prompt", "spaced repetition"
    ],
    render: () => <Review />
  },
  {
    id: "appearance",
    label: "Appearance",
    blurb: "Night or day, the accent, density and reading size.",
    keywords: [
      "theme", "dark", "light", "night", "day", "printing", "colour", "color", "accent",
      "density", "compact", "font size", "text size", "reading size", "zoom"
    ],
    render: () => <Appearance />
  },
  {
    id: "project",
    label: () => (isPersonalProject(store.get().activeProjectId) ? "Personal" : "Project"),
    blurb: "This space's name, goals, its defaults, its memory policy and its decks.",
    keywords: [
      "project", "space", "personal", "name", "blurb", "goals", "instruction",
      "knowledge", "files", "attach", "defaults", "persona", "memory policy",
      "autonomy", "decks", "move deck"
    ],
    render: () => <ProjectScope />
  },
  {
    id: "usage",
    label: "Usage",
    blurb: "What every call has cost — chat, cards, journal, distill and exam.",
    keywords: ["usage", "cost", "spend", "money", "price", "tokens", "billing", "history", "ledger"],
    render: () => <UsageScope />
  },
  {
    id: "data",
    label: "Data",
    blurb: "Back up, restore, import and export everything this browser holds.",
    keywords: [
      "backup", "back up", "restore", "recover", "recovery", "import", "export",
      "download", "upload", "json", "migrate", "move", "transfer", "copy", "another browser",
      "storage", "quota", "disk", "persistent", "eviction", "lost", "example decks", "seed"
    ],
    render: () => <Data />
  }
];

export function labelOf(c: Category): string {
  return typeof c.label === "function" ? c.label() : c.label;
}

/** The categories that can actually be rendered here. A page whose scope the
 *  current view does not provide is left out rather than shown empty. */
export function categoriesFor(has: { conversation: boolean }): Category[] {
  return CATEGORIES.filter((c) => c.needs !== "conversation" || has.conversation);
}

export function categoryById(id: CatId | null): Category | undefined {
  return CATEGORIES.find((c) => c.id === id);
}

/** Substring, case-folded, across the name, the sentence and the keywords.
 *  Deliberately not fuzzy: a search that guesses is a search you stop
 *  trusting the moment it guesses wrong. */
export function matches(c: Category, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [labelOf(c), c.blurb, ...c.keywords].join(" ").toLowerCase();
  return q.split(/\s+/).every((word) => hay.includes(word));
}
