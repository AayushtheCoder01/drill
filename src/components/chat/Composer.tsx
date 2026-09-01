/* ============================================================================
 * Composer — the input, its attachments, and the slash menu.
 *
 * Slash commands exist because the integrations are worthless if you have to
 * go hunting for them in a menu mid-thought. Typing "/" and three letters
 * keeps quizzing, card-making and context-attaching inside the flow of the
 * conversation.
 * ========================================================================== */
import { useEffect, useMemo, useRef, useState } from "react";
import * as U from "@/lib/util";
import { estimateTokens } from "@/lib/tokens";
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
  onSend: (text: string, attachments: Attachment[]) => void;
  onStop: () => void;
  /** set to a string to overwrite the draft from outside (follow-up chips) */
  seed?: { text: string; nonce: number } | null;
}

const MAX_FILE_BYTES = 400_000;

export default function Composer({ disabled, busy, placeholder, commands, onSend, onStop, seed }: Props) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [slashSel, setSlashSel] = useState(0);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (seed?.text) {
      setText(seed.text);
      ref.current?.focus();
    }
  }, [seed?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  /* autosize */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 300) + "px";
  }, [text]);

  const slashQuery = useMemo(() => {
    // only when "/" opens the message and no space has been typed yet
    const m = /^\/(\w*)$/.exec(text);
    return m ? m[1].toLowerCase() : null;
  }, [text]);

  const matches = useMemo(
    () => (slashQuery == null ? [] : commands.filter((c) => c.cmd.slice(1).startsWith(slashQuery))),
    [slashQuery, commands]
  );

  useEffect(() => setSlashSel(0), [slashQuery]);

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

        <div className="composer-box">
          {attachments.length > 0 && (
            <div className="att-row" style={{ padding: "10px 12px 0" }}>
              {attachments.map((a) => (
                <span key={a.id} className="att-chip">
                  📎 {a.name}
                  <span className="x" onClick={() => setAttachments((p) => p.filter((x) => x.id !== a.id))}>
                    <Icon name="close" size={11} />
                  </span>
                </span>
              ))}
            </div>
          )}

          <textarea
            ref={ref}
            rows={1}
            value={text}
            disabled={disabled}
            placeholder={placeholder || "Ask anything — / for commands"}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onDrop={(e) => {
              if (e.dataTransfer.files.length) {
                e.preventDefault();
                void addFiles(e.dataTransfer.files);
              }
            }}
          />

          <div className="composer-bar">
            <button className="cbtn ghost" onClick={() => fileRef.current?.click()} title="Attach a text file">
              📎
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
            {attachedTokens > 0 && (
              <span className="composer-hint" style={{ margin: 0 }}>
                ~{attachedTokens.toLocaleString()} tok attached
              </span>
            )}
            {busy ? (
              <button className="csend stop" onClick={onStop}>
                ■ Stop
              </button>
            ) : (
              <button className="csend" onClick={submit} disabled={disabled || (!text.trim() && !attachments.length)}>
                Send
              </button>
            )}
          </div>
        </div>

        <div className="composer-hint">
          <span>enter to send · shift+enter for a newline</span>
          <span>/ for commands</span>
          <span>ctrl+k palette</span>
        </div>
      </div>
    </div>
  );
}
