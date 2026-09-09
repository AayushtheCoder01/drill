/* ============================================================================
 * RunTranscript — what every AI call sent and got back.
 *
 * The debugging tool for journal, distill, exam and chat alike, and the honest
 * answer to "what is it doing". Reads services/transcript.ts, which every call
 * through services/ai's chat() writes to.
 *
 * It sits under Usage because it is the same ledger read a second way: that
 * page says what a call cost, this one says what the call was. It used to be a
 * row in the review loop's Menu, which is to say it did not exist from the
 * five sections that are not the review loop — including chat, where nearly
 * every call in the app is made.
 *
 * Session-scoped and in memory only: nothing here survives a reload, and
 * nothing here is written to disk. That is deliberate — a transcript holds the
 * whole prompt, and the whole prompt holds your memory and your notes.
 * ========================================================================== */
import { useState } from "react";
import * as transcript from "@/services/transcript";
import { formatCost, formatTokens } from "@/lib/tokens";
import { useStoreSync } from "@/hooks/useStoreSync";
import Section from "../../Section";

/** Long enough to see what shape the prompt was, short enough that forty
 *  calls do not turn the panel into a scrollback. */
const EXCERPT = 600;

function excerpt(text: string): string {
  return text.length > EXCERPT ? text.slice(0, EXCERPT) + "…" : text;
}

export default function RunTranscript() {
  useStoreSync(transcript);
  const [openId, setOpenId] = useState<string | null>(null);
  const items = transcript.list();
  const totals = transcript.totals();

  return (
    <Section id="usage.transcript" title={items.length ? `Run transcript (${items.length})` : undefined}>
      {items.length === 0 ? (
        <div className="empty">
          Nothing sent yet this session. Every journal, distill, exam, card-writing or chat call shows up here, in
          full, until you reload.
        </div>
      ) : (
        <>
          <p className="sset-note">
            {formatTokens(totals.promptTokens)} in · {formatTokens(totals.completionTokens)} out ·{" "}
            {formatCost(totals.cost)} this session. Kept in memory only — a reload clears it.
          </p>

          <div className="list">
            {items.map((e) => (
              <div key={e.id} className="tr-call">
                <button
                  className="tr-head"
                  aria-expanded={openId === e.id}
                  onClick={() => setOpenId(openId === e.id ? null : e.id)}
                >
                  <span className="tagmini">{e.label}</span>
                  <span className="s">
                    {e.model} · {(e.elapsedMs / 1000).toFixed(1)}s{e.error ? " · failed" : ""}
                  </span>
                </button>

                {openId === e.id && (
                  <div className="tr-body">
                    {e.messages.map((m, i) => (
                      <div key={i} className="tr-msg">
                        <b>{m.role}</b>
                        {excerpt(m.content)}
                      </div>
                    ))}
                    {e.response && (
                      <div className="tr-msg reply">
                        <b>reply</b>
                        {excerpt(e.response)}
                      </div>
                    )}
                    {e.error && <div className="err">{e.error}</div>}
                    {e.usage && (
                      <p className="sset-note">
                        {e.usage.promptTokens} in · {e.usage.completionTokens} out
                        {e.usage.cost != null ? ` · ${formatCost(e.usage.cost)}` : ""}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="btnrow">
            <button className="btn sm" onClick={() => transcript.clear()}>
              Clear the transcript
            </button>
          </div>
        </>
      )}
    </Section>
  );
}
