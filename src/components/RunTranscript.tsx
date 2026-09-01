/* ============================================================================
 * RunTranscript — what every AI call sent and got back.
 *
 * The debugging tool for journal, distill, exam and chat alike, and the
 * honest answer to "what is it doing". Reads services/transcript.ts, which
 * every call through services/ai's chat() writes to.
 * ========================================================================== */
import { useState } from "react";
import * as transcript from "@/services/transcript";
import { formatCost, formatTokens } from "@/lib/tokens";
import { useStoreSync } from "@/hooks/useStoreSync";
import SheetShell from "./SheetShell";

export default function RunTranscript() {
  useStoreSync(transcript);
  const [openId, setOpenId] = useState<string | null>(null);
  const items = transcript.list();
  const totals = transcript.totals();

  return (
    <SheetShell title="Run transcript" sub={`${items.length} calls this session`}>
      {items.length > 0 && (
        <div className="hintline">
          {formatTokens(totals.promptTokens)} in · {formatTokens(totals.completionTokens)} out · {formatCost(totals.cost)} this session.
        </div>
      )}
      {items.length === 0 && <div className="empty">Nothing sent yet — every journal, distill, exam or chat call will show up here.</div>}
      <div className="list">
        {items.map((e) => (
          <div key={e.id} className="item" style={{ flexDirection: "column", alignItems: "stretch", cursor: "pointer" }} onClick={() => setOpenId(openId === e.id ? null : e.id)}>
            <div style={{ display: "flex", justifyContent: "space-between", width: "100%", gap: 10 }}>
              <span className="tagmini">{e.label}</span>
              <span className="s">
                {e.model} · {(e.elapsedMs / 1000).toFixed(1)}s{e.error ? " · failed" : ""}
              </span>
            </div>
            {openId === e.id && (
              <div style={{ marginTop: 8 }}>
                {e.messages.map((m, i) => (
                  <div key={i} className="hintline" style={{ whiteSpace: "pre-wrap" }}>
                    <strong>{m.role}:</strong> {m.content.slice(0, 600)}
                    {m.content.length > 600 ? "…" : ""}
                  </div>
                ))}
                {e.response && (
                  <div className="hintline" style={{ whiteSpace: "pre-wrap", color: "var(--green)" }}>
                    <strong>reply:</strong> {e.response.slice(0, 600)}
                    {e.response.length > 600 ? "…" : ""}
                  </div>
                )}
                {e.error && <div className="err">{e.error}</div>}
                {e.usage && (
                  <div className="hintline">
                    {e.usage.promptTokens} in · {e.usage.completionTokens} out{e.usage.cost != null ? ` · ${formatCost(e.usage.cost)}` : ""}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      {items.length > 0 && (
        <button className="btn sm" onClick={() => transcript.clear()}>
          Clear
        </button>
      )}
    </SheetShell>
  );
}
