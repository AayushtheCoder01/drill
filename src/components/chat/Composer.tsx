/* ============================================================================
 * Composer — the input, its attachments, and the slash menu.
 *
 * Slash commands exist because the integrations are worthless if you have to
 * go hunting for them in a menu mid-thought. Typing "/" and three letters
 * keeps quizzing, card-making and context-attaching inside the flow of the
 * conversation.
 *
 * "@" is the other half. A slash command *does* something; an "@" points at
 * something you already have — a journal entry, a book on the project shelf,
 * a deck, a card, a memory — and rides along with this one message. It is the
 * file-attach gesture every chat app has, except the things being attached
 * are yours and already in the app, so there is nothing to upload.
 *
 * Note the difference from conversation context, which is standing policy
 * attached to every message in the thread. A reference is for the sentence
 * you are writing now.
 *
 * The composer earns its height. At rest it is one line - the box and Send,
 * nothing else - because on a laptop window this bar was 172px of a 522px
 * screen and the transcript above it had barely half the page to read in.
 * The tool row (model, effort, actions, attach) and the key hints appear
 * once the composer has focus or something in it, which is exactly when they
 * are worth their room and never while you are reading.
 * ========================================================================== */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as U from "@/lib/util";
import { estimateTokens } from "@/lib/tokens";
import { KIND_LABEL, search, toAttachment, type Reference } from "@/lib/references";
import type { Attachment } from "@/types/chat";
import Icon from "../ui/Icon";

export interface SlashCommand {
  cmd: string;
  desc: string;
  /** run instead of sending; returns text to leave in the box, if any */
  run: (arg: string) => void;
}

interface Props {
  disabled: boolean;
  busy: boolean;
  placeholder?: string;
  commands: SlashCommand[];
  /** Everything referenceable, rebuilt by the caller so the composer never
   *  reaches into the stores itself. */
  references: Reference[];
  /** Rendered at the left of the composer bar — the model chip. Passed in
   *  rather than built here so the composer stays ignorant of conversations. */
  tools?: ReactNode;
  onSend: (text: string, attachments: Attachment[]) => void;
  onStop: () => void;
  /** set to a string to overwrite the draft from outside (follow-up chips) */
  seed?: { text: string; nonce: number } | null;
}

const MAX_FILE_BYTES = 400_000;

export default function Composer({ disabled, busy, placeholder, commands, references, tools, onSend, onStop, seed }: Props) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [slashSel, setSlashSel] = useState(0);
  const [refSel, setRefSel] = useState(0);
  /** Where the caret was when the last change happened. The "@" token is
   *  found by looking backwards from here, not from the end of the text, so a
   *  reference can be dropped into the middle of a sentence. */
  const [caret, setCaret] = useState(0);
  /** Set the moment a reference is chosen (or the picker is dismissed), and
   *  cleared by the next keystroke. Without it the menu reopens on its own
   *  inserted token: the caret moves in a rAF *after* React has re-rendered
   *  with the new text and the old caret, and that one frame is enough to
   *  match "@" again and leave the menu stuck open. */
  const [refOff, setRefOff] = useState(false);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (seed?.text) {
      setText(seed.text);
      ref.current?.focus();
    }
  }, [seed?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Autosize. An empty box is left at its one-row default rather than
     measured: Chrome counts a wrapped *placeholder* in scrollHeight, so on a
     narrow screen the composer opened two lines tall before a single
     character had been typed. */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    if (text) el.style.height = Math.min(el.scrollHeight, 220) + "px";
  }, [text]);

  const slashQuery = useMemo(() => {
    // only when "/" opens the message and no space has been typed yet
    const m = /^\/(\w*)$/.exec(text);
    return m ? m[1].toLowerCase() : null;
  }, [text]);

  /* The "@" token immediately before the caret, if there is one. Anchored to
     a word boundary so an email address does not open the picker, and with
     brackets excluded so the "@[journal: ...]" token this inserts cannot
     match itself and hold the menu open. */
  const refQuery = useMemo(() => {
    if (refOff) return null;
    const before = text.slice(0, caret);
    const m = /(?:^|\s)@([^\n@\[\]]{0,40})$/.exec(before);
    if (!m) return null;
    return m[1];
  }, [text, caret, refOff]);

  const refMatches = useMemo(
    () => (refQuery == null ? [] : search(references, refQuery)),
    [refQuery, references]
  );

  useEffect(() => setRefSel(0), [refQuery]);

  const matches = useMemo(
    () => (slashQuery == null ? [] : commands.filter((c) => c.cmd.slice(1).startsWith(slashQuery))),
    [slashQuery, commands]
  );

  useEffect(() => setSlashSel(0), [slashQuery]);

  /** Swap the "@query" token for a readable label and attach the material.
   *  The label stays in the text so the sentence still reads as a sentence
   *  when you look at it later — "compare @[journal: 2026-9-1] with today". */
  function pickRef(r: Reference) {
    const before = text.slice(0, caret);
    const after = text.slice(caret);
    const token = /(?:^|\s)@([^\n@\[\]]{0,40})$/.exec(before);
    const cut = token ? before.length - token[1].length - 1 : before.length;
    const label = `@[${KIND_LABEL[r.kind]}: ${r.label}] `;
    const next = before.slice(0, cut) + label + after;
    setText(next);
    setRefOff(true);
    setAttachments((prev) => (prev.some((a) => a.name === `${KIND_LABEL[r.kind]}: ${r.label}`) ? prev : [...prev, toAttachment(r)]));
    const pos = cut + label.length;
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(pos, pos);
      setCaret(pos);
    });
  }

  function runSlash(c: SlashCommand) {
    const arg = text.replace(/^\/\w*\s*/, "");
    setText("");
    c.run(arg);
  }

  function submit() {
    if (busy || disabled) return;
    const body = text.trim();
    if (!body && !attachments.length) return;

    // "/cmd rest of line" dispatches instead of sending
    const m = /^\/(\w+)(?:\s+([\s\S]*))?$/.exec(body);
    if (m) {
      const found = commands.find((c) => c.cmd === "/" + m[1].toLowerCase());
      if (found) {
        setText("");
        found.run((m[2] || "").trim());
        return;
      }
    }

    onSend(body, attachments);
    setText("");
    setAttachments([]);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (refMatches.length) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setRefSel((i) => (i + 1) % refMatches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setRefSel((i) => (i - 1 + refMatches.length) % refMatches.length);
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        pickRef(refMatches[refSel]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setRefOff(true); // closes it without touching what was typed
        return;
      }
    }
    if (matches.length) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashSel((i) => (i + 1) % matches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashSel((i) => (i - 1 + matches.length) % matches.length);
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        runSlash(matches[slashSel]);
        return;
      }
      if (e.key === "Escape") {
        setText("");
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  async function addFiles(files: FileList | File[]) {
    const next: Attachment[] = [];
    for (const f of Array.from(files)) {
      if (f.size > MAX_FILE_BYTES) {
        next.push({
          id: U.uid("a"),
          name: f.name + " (too large)",
          kind: "file",
          size: f.size,
          text: `[skipped: ${Math.round(f.size / 1024)}KB exceeds the ${MAX_FILE_BYTES / 1024}KB limit]`
        });
        continue;
      }
      const text = await f.text().catch(() => "");
      next.push({ id: U.uid("a"), name: f.name, kind: "file", size: f.size, text });
    }
    setAttachments((prev) => [...prev, ...next]);
  }

  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const pasted = e.clipboardData.getData("text");
    // A very large paste is a document, not a sentence: file it as an
    // attachment so the composer stays readable.
    if (pasted.length > 4000) {
      e.preventDefault();
      setAttachments((prev) => [
        ...prev,
        { id: U.uid("a"), name: `pasted-${prev.length + 1}.txt`, kind: "selection", size: pasted.length, text: pasted }
      ]);
    }
  }

  const attachedTokens = attachments.reduce((n, a) => n + estimateTokens(a.text), 0);
  /* Focus alone opens the tool row (CSS :focus-within); this keeps it open
     once there is something to send, so it does not shut under your hands
     when you tab away mid-draft. */
  const armed = !!text || attachments.length > 0;

  return (
    <div className="composer">
      <div className="composer-inner">
        {matches.length > 0 && (
          <div className="slashmenu">
            {matches.map((c, i) => (
              <button key={c.cmd} className={"slashitem" + (i === slashSel ? " sel" : "")} onClick={() => runSlash(c)}>
                <span className="cmd">{c.cmd}</span>
                <span className="desc">{c.desc}</span>
              </button>
            ))}
          </div>
        )}

        {refMatches.length > 0 && (
          <div className="slashmenu refmenu">
            <div className="refmenu-head">Refer to something of yours</div>
            {refMatches.map((r, i) => (
              <button
                key={r.id}
                className={"slashitem" + (i === refSel ? " sel" : "")}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pickRef(r);
                }}
              >
                <span className="cmd">{KIND_LABEL[r.kind]}</span>
                <span className="reflabel">{r.label}</span>
                <span className="desc">{r.hint}</span>
              </button>
            ))}
          </div>
        )}

        <div className={"composer-box" + (armed ? " armed" : "")}>
          {attachments.length > 0 && (
            <div className="att-row">
              {attachments.map((a) => (
                <span key={a.id} className="att-chip">
                  <Icon name="paperclip" size={11} /> {a.name}
                  <span className="x" onClick={() => setAttachments((p) => p.filter((x) => x.id !== a.id))}>
                    <Icon name="close" size={11} />
                  </span>
                </span>
              ))}
            </div>
          )}

          {/* Send sits beside the box rather than under it, which is the whole
              reason an empty composer is one line tall. */}
          <div className="composer-row">
            <textarea
              ref={ref}
              rows={1}
              value={text}
              disabled={disabled}
              placeholder={placeholder || "Ask anything — / for commands"}
              onChange={(e) => {
                setText(e.target.value);
                setCaret(e.target.selectionStart ?? e.target.value.length);
                setRefOff(false);
              }}
              onKeyUp={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart ?? 0)}
              onClick={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart ?? 0)}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              onDrop={(e) => {
                if (e.dataTransfer.files.length) {
                  e.preventDefault();
                  void addFiles(e.dataTransfer.files);
                }
              }}
            />
            {busy ? (
              <button className="csend stop" onClick={onStop} title="Stop generating" aria-label="Stop generating">
                <Icon name="stop" size={13} />
              </button>
            ) : (
              <button
                className="csend"
                onClick={submit}
                disabled={disabled || (!text.trim() && !attachments.length)}
                title="Send  (enter)"
                aria-label="Send"
              >
                <Icon name="send" size={15} />
              </button>
            )}
          </div>

          {/* Opened by focus or by having something to send. Kept mounted
              either way: a chip that unmounted on blur would close its own
              popover the moment you clicked into it. */}
          <div className="composer-tools">
            {tools}
            <button className="cbtn ghost attach-btn" onClick={() => fileRef.current?.click()} title="Attach a text file" aria-label="Attach a text file">
              <Icon name="paperclip" size={12} />
              <span>Attach</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept=".txt,.md,.json,.csv,.py,.js,.ts,.tsx,.jsx,.html,.css,.yml,.yaml,.r,.sql,.java,.c,.cpp,.go,.rs,text/*"
              style={{ display: "none" }}
              onChange={(e) => {
                if (e.target.files) void addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            {attachedTokens > 0 && <span className="composer-hint">~{attachedTokens.toLocaleString()} tok attached</span>}
            {/* The hint strip used to stand under the box for ever: three
                lines, 47px, instructions you had read on your first day. One
                line now, and only while there is nothing typed. */}
            {!text && (
              <span className="composer-hint keys">
                enter sends · shift+enter newline · / and @
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
