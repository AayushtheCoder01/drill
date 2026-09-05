/* ============================================================================
 * RegenerateMenu — a split button on every reply: the left half redoes the
 * answer with whatever model is already in force, the right half opens a
 * one-shot picker for trying a different one.
 *
 * The composer's ModelChip pins a choice to the whole thread going forward,
 * which is the wrong tool for "try that again with a bigger model" — you end
 * up pinning, regenerating, then remembering to unpin. This keeps that
 * comparison to a single click: the override applies to this one variant
 * only and never touches conversation.model.
 * ========================================================================== */
import { useEffect, useRef, useState } from "react";
import * as AI from "@/services/ai";
import { useToast } from "@/context/ToastContext";
import type { BackendType } from "@/types";
import Icon from "../ui/Icon";

export default function RegenerateMenu({
  backend,
  currentModel,
  busy,
  onRegenerate
}: {
  backend: BackendType | "";
  /** Resolved model in force for this thread — the row it's already on gets marked. */
  currentModel: string;
  busy: boolean;
  onRegenerate: (override?: { backend?: BackendType | ""; model?: string }) => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  /* Fetched lazily on first open, same reasoning as ModelChip: most replies
     are never regenerated, so most turns should never make this call. */
  useEffect(() => {
    if (!open || models.length || loading) return;
    setLoading(true);
    AI.listModels(backend ? { backend } : undefined)
      .then(setModels)
      .catch((e: Error) => toast(e.message, 5000))
      .finally(() => setLoading(false));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function pick(model: string) {
    setOpen(false);
    setQuery("");
    onRegenerate({ backend, model });
  }

  const q = query.trim().toLowerCase();
  const shown = (q ? models.filter((m) => m.toLowerCase().includes(q)) : models).slice(0, 40);

  return (
    <div className="regenmenu" ref={boxRef}>
      <button
        className="tact regenmenu-main"
        onClick={() => onRegenerate()}
        disabled={busy}
        title="Regenerate with the current model"
      >
        <Icon name="sparkle" size={11} />
        <span>Regenerate</span>
      </button>
      <button
        className="tact regenmenu-caret"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        title="Regenerate with a different model"
        aria-label="Regenerate with a different model"
      >
        <Icon name="chevron" size={10} />
      </button>

      {open && (
        <div className="modelpop">
          <div className="modelpop-head">
            <span>Regenerate with…</span>
          </div>

          <input
            className="fi mono"
            autoFocus
            placeholder={loading ? "loading the list…" : "search, or type any model id"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && query.trim()) pick(query.trim());
            }}
          />

          <div className="modelpop-list">
            {loading && <div className="modelpop-empty">fetching what your key can reach…</div>}
            {!loading && shown.length === 0 && (
              <div className="modelpop-empty">
                {models.length ? "Nothing matches." : "No list available — type an id and press enter."}
              </div>
            )}
            {shown.map((m) => (
              <button key={m} className={"modelpop-row" + (m === currentModel ? " on" : "")} onClick={() => pick(m)}>
                {m}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
