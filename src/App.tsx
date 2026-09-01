import { Suspense, lazy, useEffect, useRef, useState } from "react";
import * as CFG from "@/lib/config";
import * as store from "@/services/store";
import * as chatStore from "@/services/chatStore";
import * as memoryStore from "@/services/memoryStore";
import * as candidates from "@/services/candidates";
import * as journalStore from "@/services/journalStore";
import * as examStore from "@/services/examStore";
import * as storage from "@/services/storage";
import { applyAppearance } from "@/lib/theme";
import { useDrillStore } from "@/hooks/useDrillStore";
import { ToastProvider } from "@/context/ToastContext";
import { SheetProvider } from "@/context/SheetContext";
import { ReviewProvider } from "@/context/ReviewContext";
import { RouteProvider, useRoute } from "@/context/RouteContext";
import { ChatProvider } from "@/context/ChatContext";
import AppShell from "@/components/AppShell";

/** Renders nothing — just keeps :root's appearance custom properties in sync
 *  with Settings, for both the drill and chat views. Split out so it can sit
 *  above the view branch in Views() without either view needing to know
 *  appearance exists. */
function AppearanceSync() {
  const db = useDrillStore();
  useEffect(() => {
    applyAppearance(db.settings);
  }, [db.settings.theme, db.settings.accent, db.settings.density, db.settings.textScale]);
  return null;
}

/* Chat, journal and exam all pull in weight the review loop should not pay
   for on its first paint (KaTeX/highlight.js for chat; the journal/exam
   views are smaller but still no reason to ship on the daily path) — each is
   its own chunk, lazy-loaded only when its view is actually opened. */
const ChatView = lazy(() => import("@/components/chat/ChatView"));
const JournalView = lazy(() => import("@/components/journal/JournalView"));
const ExamView = lazy(() => import("@/components/exam/ExamView"));

function LoadingShell() {
  return (
    <div className="app">
      <div className="app-scroll">
        <div className="page">
          <div className="msg">
            <p>
              <span className="pulse"></span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Views() {
  const { view } = useRoute();

  if (view === "chat") {
    return (
      <ChatProvider>
        <Suspense fallback={<LoadingShell />}>
          <ChatView />
        </Suspense>
      </ChatProvider>
    );
  }

  if (view === "journal") {
    return (
      <Suspense fallback={<LoadingShell />}>
        <JournalView />
      </Suspense>
    );
  }

  if (view === "exam") {
    return (
      <Suspense fallback={<LoadingShell />}>
        <ExamView />
      </Suspense>
    );
  }

  return (
    <SheetProvider>
      <ReviewProvider>
        <AppShell />
      </ReviewProvider>
    </SheetProvider>
  );
}

export default function App() {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const booted = useRef(false);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    CFG.load()
      .then((cfg) => {
        store.init(cfg);
        // Conversation metadata loads in the background: the review loop must
        // not wait on IndexedDB to render.
        void chatStore.init();
        void memoryStore.init();
        void candidates.init();
        void journalStore.init();
        void examStore.init();
        // Ask the browser not to evict us. Chrome usually grants it silently,
        // Firefox prompts, Safari decides for itself — a refusal is normal and
        // only means the export in Import/export matters more.
        void storage.requestPersistence();
        setStatus("ready");
      })
      .catch((e: Error) => {
        setError(e.message);
        setStatus("error");
      });
  }, []);

  if (status === "error") {
    return (
      <div className="app">
        <div className="app-scroll">
          <div className="page">
            <div className="msg">
              <h2>Drill could not start</h2>
              <p>{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (status === "loading") return <LoadingShell />;

  return (
    <ToastProvider>
      <AppearanceSync />
      <RouteProvider>
        <Views />
      </RouteProvider>
    </ToastProvider>
  );
}
