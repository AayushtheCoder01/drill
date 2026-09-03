/* ============================================================================
 * ChatView — the chat platform's shell: sidebar, transcript, composer, and
 * the surfaces that hang off them (settings drawer, command palette, card
 * maker).
 *
 * Owns the slash commands and palette actions, because those are the places
 * where chat reaches into the drill half of the app and it is worth having
 * that wiring in one readable list rather than scattered through components.
 * ========================================================================== */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as chatStore from "@/services/chatStore";
import * as store from "@/services/store";
import * as AI from "@/services/ai";
import * as memoryCapture from "@/services/memoryCapture";
import ActionChips from "./ActionChips";
import { poolFor } from "@/lib/memoryBrief";
import type { ChatMessage } from "@/types";
import { useChat } from "@/context/ChatContext";
import { useRoute } from "@/context/RouteContext";
import { useToast } from "@/context/ToastContext";
import { useDrillStore } from "@/hooks/useDrillStore";
import { describeSource } from "@/lib/chatContext";
import { catalogue } from "@/lib/references";
import { markdownToText } from "@/lib/markdown";
import { estimateTurnTokens, formatCost, formatTokens } from "@/lib/tokens";
import { getPersona } from "@/lib/personas";
import { download, slug } from "@/lib/util";
import Shell from "../Shell";
import ChatRail from "../rail/ChatRail";
import Icon from "../ui/Icon";
import ChatSidebar from "./ChatSidebar";
import MessageTurn from "./MessageTurn";
import Composer, { type SlashCommand } from "./Composer";
import ConversationSettings from "./ConversationSettings";
import CommandPalette, { type PaletteAction } from "./CommandPalette";
import CardsModal from "./CardsModal";
import ChatEmpty from "./ChatEmpty";
import ModelChip from "./ModelChip";
import EffortChip from "./EffortChip";

/* Imported here rather than in main.tsx so both stylesheets ride along with
   the lazy chat chunk instead of blocking the review loop's first paint. */
import "@/styles/chat.css";
import "katex/dist/katex.min.css";

export default function ChatView() {
  const chat = useChat();
  const { conversationId, openDrill } = useRoute();
  const toast = useToast();
  useDrillStore(); // deck/note changes should refresh context labels

  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const [cardSource, setCardSource] = useState<string | null>(null);
  const [seed, setSeed] = useState<{ text: string; nonce: number } | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pinnedToBottom = useRef(true);

  const c = chat.conversation;

  /* Rebuilt whenever the stores change, which is what useDrillStore above is
     for — a journal entry written a minute ago has to be referenceable now,
     not after a reload. Cheap: every `text` in it is a thunk. */
  const references = useMemo(
    () => catalogue(c?.projectId || store.get().activeProjectId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [c?.projectId, store.getVersion()]
  );

  useEffect(() => {
    void chatStore.init();
  }, []);

  /* Follow the stream only while the reader is already at the bottom —
     yanking the viewport while someone is reading further up is the single
     most irritating thing a chat UI can do. */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      pinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [conversationId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && pinnedToBottom.current) el.scrollTop = el.scrollHeight;
  }, [chat.streaming, c?.turns.length, conversationId]);

  /* ---------------------------------------------------------- shortcuts -- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((v) => !v);
      } else if (mod && e.key.toLowerCase() === "j") {
        e.preventDefault();
        newChat();
      } else if (e.key === "Escape") {
        if (palette) setPalette(false);
        else if (cardSource) setCardSource(null);
        else if (drawer) setDrawer(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [palette, cardSource, drawer]); // eslint-disable-line react-hooks/exhaustive-deps

  const newChat = useCallback(() => chat.newConversation(), [chat]);

  /* ------------------------------------------------------------ actions -- */

  const saveNote = useCallback(
    (text: string) => {
      const clean = markdownToText(text).slice(0, 4000);
      if (!clean) return;
      store.addNote(clean, c?.titled ? c.title : "chat");
      toast("Saved to the insight log");
    },
    [c, toast]
  );

  const exportConversation = useCallback(() => {
    if (!c) return;
    download(slug(c.title) + ".md", chatStore.toMarkdown(c), "text/markdown");
    toast("Exported");
  }, [c, toast]);

  /**
   * The deliberate save. Unlike the natural-language path — which rides along
   * in a normal reply for free — this is its own extraction pass, so it fires
   * whether or not the model noticed you asking.
   *
   * Only turns since `rolledUpThrough` are sent, so running it twice does not
   * re-mine the same conversation.
   */
  const rememberConversation = useCallback(async () => {
    if (!c) return;
    const fresh = c.turns.slice(c.rolledUpThrough || 0);
    if (!fresh.length) {
      toast("Nothing new since the last save");
      return;
    }

    toast("Reading the conversation…");
    try {
      const msgs = fresh
        .filter((t) => t.variants.length)
        .map((t) => ({ role: t.role, content: markdownToText(chatStore.activeContent(t)) }) as ChatMessage);

      const known = poolFor("both", c.projectId).map((m) => m.text);
      const items = await AI.wrapUp(msgs, known);

      if (!items.length) {
        c.rolledUpThrough = c.turns.length;
        chatStore.persist(c, true);
        toast("Nothing durable worth keeping — memory left alone");
        return;
      }

      const lastTurn = c.turns[c.turns.length - 1];
      const result = memoryCapture.capture(items, { conversationId: c.id, turnId: lastTurn?.id || "" });
      memoryCapture.logToJournal(result, "Saved from chat");

      /* Hang the outcome on the last assistant turn so it renders inline, the
         same as the natural-language path. */
      const target = [...c.turns].reverse().find((t) => t.role === "assistant" && t.variants.length);
      if (target) {
        const v = target.variants[target.active];
        v.saved = memoryCapture.merge(v.saved, memoryCapture.summarise(result));
      }

      c.rolledUpThrough = c.turns.length;
      chatStore.persist(c, true);

      const n = result.committed.length + result.queued.length;
      toast(n ? `${n} to memory` : "Already knew all of that");
    } catch (e) {
      toast((e as Error).message || "Could not read the conversation");
    }
  }, [c, toast]);

  /* ----------------------------------------------------- slash commands -- */

  const commands: SlashCommand[] = useMemo(
    () => [
      {
        cmd: "/cards",
        desc: "Turn the last reply into flashcards",
        run: () => {
          const last = [...(c?.turns || [])].reverse().find((t) => t.role === "assistant" && t.variants.length);
          if (!last) {
            toast("Nothing to make cards from yet");
            return;
          }
          setCardSource(markdownToText(chatStore.activeContent(last)));
        }
      },
      {
        cmd: "/quiz",
        desc: "Get quizzed on what is due right now",
        run: (arg: string) => {
          const counts = store.counts();
          if (!counts.due && !counts.newLeft) {
            toast("Nothing due — try /weak instead");
            return;
          }
          chat.newConversation(
            {
              title: "Quiz session",
              personaId: "socratic",
              context: [{ kind: "due", deckId: null }]
            },
            "Quiz me on the cards that are due right now" +
              (arg ? `, focusing on ${arg}` : "") +
              ". Ask one question at a time, wait for my answer, then tell me what I missed before moving on. " +
              "Do not show me the card's answer until I have attempted it."
          );
        }
      },
      {
        cmd: "/weak",
        desc: "Work on the cards you keep failing",
        run: (arg: string) => {
          chat.newConversation(
            {
              title: "Weak spots",
              personaId: "tutor",
              context: [{ kind: "weak", deckId: null }]
            },
            "Look at the cards I keep failing" +
              (arg ? ` related to ${arg}` : "") +
              ". Find what they have in common — the underlying idea I have not actually understood — and teach me " +
              "that, rather than drilling the cards one by one."
          );
        }
      },
      {
        cmd: "/explain",
        desc: "Explain a topic from scratch",
        run: (arg: string) => {
          if (!arg) {
            toast("Say what to explain: /explain backprop");
            return;
          }
          chat.newConversation({ title: arg.slice(0, 60), personaId: "explain" }, `Explain ${arg} from first principles.`);
        }
      },
      {
        cmd: "/feynman",
        desc: "You explain it, the model finds the holes",
        run: (arg: string) => {
          chat.newConversation(
            { title: arg ? `Feynman: ${arg.slice(0, 40)}` : "Feynman check", personaId: "feynman" },
            arg ? `I am going to explain ${arg} to you. Ask me to begin.` : "I am going to explain something to you. Ask me what."
          );
        }
      },
      {
        cmd: "/deck",
        desc: "Attach a deck as context",
        run: () => {
          setDrawer(true);
          toast("Pick a deck under “Attach a whole deck”");
        }
      },
      {
        cmd: "/note",
        desc: "Save the last reply to the insight log",
        run: () => {
          const last = [...(c?.turns || [])].reverse().find((t) => t.role === "assistant" && t.variants.length);
          if (!last) {
            toast("Nothing to save yet");
            return;
          }
          saveNote(chatStore.activeContent(last));
        }
      },
      {
        cmd: "/remember",
        desc: "Save what this conversation is worth remembering",
        run: () => void rememberConversation()
      },
      {
        cmd: "/export",
        desc: "Download this conversation as markdown",
        run: exportConversation
      },
      {
        cmd: "/settings",
        desc: "Model, mode, temperature, context",
        run: () => setDrawer(true)
      }
    ],
    [c, chat, saveNote, exportConversation, toast]
  );

  /* --------------------------------------------------- palette actions -- */

  const paletteActions: PaletteAction[] = useMemo(
    () => [
      { id: "new", label: "New chat", hint: "ctrl+J", run: newChat },
      { id: "drill", label: "Go to the review loop", hint: "view", run: openDrill },
      { id: "settings", label: "Conversation settings", hint: "action", run: () => setDrawer(true) },
      { id: "export", label: "Export this conversation", hint: "action", run: exportConversation },
      ...commands.map((cm) => ({ id: cm.cmd, label: cm.desc, hint: cm.cmd, run: () => cm.run("") }))
    ],
    [newChat, openDrill, exportConversation, commands]
  );

  /* -------------------------------------------------------------- render -- */

  const resolved = c ? AI.resolve({ backend: c.backend, model: c.model }) : AI.resolve();
  const readiness = AI.ready(c ? { backend: c.backend, model: c.model } : undefined);
  const contextTokens = c ? estimateTurnTokens(c.turns) : 0;

  return (
    /* The conversation index is passed to the shared sidebar rather than
       rendered as a second one. Chat used to carry its own 268px pane, its
       own navigation, its own project switcher and its own settings surface,
       none of which agreed with the rest of the app; what is left below is
       only the conversation itself. */
    <Shell current="chat" sidebar={<ChatSidebar onNew={newChat} />} aside={<ChatRail conversation={c} />} asideLabel="Context">
      <div className="chat-main">
        <div className="chat-head">
          {c ? (
            <>
              <button
                className="chat-title"
                title="Rename"
                onClick={() => {
                  const n = window.prompt("Rename this conversation:", c.title);
                  if (n) chatStore.rename(c, n);
                }}
              >
                {c.title}
              </button>
              <div className="chat-meta">
                <span>{resolved.model}</span>
                <span>{getPersona(c.personaId).name}</span>
                <span title="Approximate — counted without the model's tokeniser">
                  ~{formatTokens(contextTokens)} ctx
                </span>
                {c.usage.cost != null && <span>{formatCost(c.usage.cost)}</span>}
              </div>
              <button
                className={"chat-headbtn" + (c.pinned ? " on" : "")}
                onClick={() => chatStore.setPinned(c, !c.pinned)}
                title={c.pinned ? "Unpin" : "Pin"}
                aria-pressed={c.pinned}
              >
                <Icon name={c.pinned ? "star-filled" : "star"} />
              </button>
              <button className={"chat-headbtn" + (drawer ? " on" : "")} onClick={() => setDrawer((v) => !v)}>
                Settings
              </button>
            </>
          ) : (
            <>
              <span className="chat-title">New conversation</span>
              <div className="chat-meta">
                <span>{resolved.backend.label}</span>
              </div>
            </>
          )}
        </div>

        {c && c.context.length > 0 && (
          <div className="ctxbar">
            <span className="lbl">Context</span>
            {c.context.map((s, i) => (
              <span key={i} className="ctxchip">
                {describeSource(s)}
                <button onClick={() => chat.setContext(c.context.filter((_, j) => j !== i))} aria-label="Remove">
                  <Icon name="close" size={11} />
                </button>
              </span>
            ))}
          </div>
        )}

        {!c || c.turns.length === 0 ? (
          <ChatEmpty
            ready={readiness}
            onStart={(prompt, opts) => {
              if (c && c.turns.length === 0) {
                if (opts) chat.update(opts);
                void chat.send(prompt);
              } else {
                chat.newConversation(opts, prompt);
              }
            }}
            onPrefill={(text) => setSeed({ text, nonce: Date.now() })}
          />
        ) : (
          <div className="msgs" ref={scrollRef}>
            <div className="msgs-inner">
              {!readiness.ok && <div className="chat-err">{readiness.why}</div>}

              {c.turns.map((t, i) => (
                <MessageTurn
                  key={t.id}
                  turn={t}
                  isLast={i === c.turns.length - 1}
                  streamingText={chat.streamingTurnId === t.id ? chat.streaming : null}
                  busy={chat.busy}
                  onRegenerate={() => void chat.regenerate(t.id)}
                  onEdit={(text) => void chat.editUserTurn(t.id, text)}
                  onBranch={() => chat.branchFrom(i)}
                  onMakeCards={(text) => setCardSource(text)}
                  onSaveNote={saveNote}
                  onVariant={(v) => {
                    chatStore.setVariant(c, t, v);
                    chat.update({});
                  }}
                  onStar={() => {
                    t.starred = !t.starred;
                    chatStore.persist(c, true);
                    chat.update({});
                  }}
                  onDelete={() => {
                    chatStore.removeTurn(c, t.id);
                    chat.update({});
                  }}
                  onRetry={() => void chat.retry()}
                />
              ))}

              {chat.followups.length > 0 && !chat.busy && (
                <div className="followups">
                  {chat.followups.map((f, i) => (
                    <button key={i} className="fchip" onClick={() => void chat.send(f)}>
                      {f}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <Composer
          key={conversationId || "new"}
          disabled={!readiness.ok}
          busy={chat.busy}
          commands={commands}
          references={references}
          tools={
            <>
              <ModelChip conversation={c} draftModel={chat.draftModel} onDraftModel={chat.setDraftModel} />
              <EffortChip conversation={c} draftEffort={chat.draftEffort} onDraftEffort={chat.setDraftEffort} />
              <ActionChips
                active={c?.actions || []}
                backend={c?.backend}
                model={c?.model || chat.draftModel}
                onChange={(actions) => chat.update({ actions })}
              />
            </>
          }
          seed={seed}
          placeholder={readiness.ok ? "Ask anything — / for commands" : readiness.why}
          onSend={(text, attachments) => void chat.send(text, attachments)}
          onStop={chat.stop}
        />

        {drawer && <ConversationSettings onClose={() => setDrawer(false)} />}
      </div>

      {palette && <CommandPalette actions={paletteActions} onClose={() => setPalette(false)} />}
      {cardSource && <CardsModal source={cardSource} onClose={() => setCardSource(null)} />}
    </Shell>
  );
}
