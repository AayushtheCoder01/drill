/* ============================================================================
 * ModelPicker — the settings-side model control: a button that opens the same
 * structured ModelPickerPanel the chat composer's chip uses.
 *
 * This used to be a plain text input backed by a native <datalist> that only
 * filled in after an explicit "Load model list" click — no search, no
 * grouping, no price or capability shown, nothing remembered between visits.
 * Fetching now happens lazily on open, the same way the chip does it, so
 * there is no separate load step at all.
 * ========================================================================== */
import { useEffect, useRef, useState } from "react";
import * as AI from "@/services/ai";
import { useToast } from "@/context/ToastContext";
import SettingRow from "./SettingRow";
import ModelPickerPanel from "./ModelPickerPanel";
import type { BackendType } from "@/types";

export default function ModelPicker({
  title = "Model",
  sub,
  origin,
  value,
  placeholder,
  backend,
  onChange
}: {
  title?: string;
  sub?: string;
  origin?: string;
  value: string;
  placeholder?: string;
  backend?: BackendType | "";
  onChange: (v: string) => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
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

  /* Fetched the first time the popover opens, not on mount — same reasoning
     as the chip: most settings visits never touch this, and it is a network
     call against the user's own key. */
  useEffect(() => {
    if (!open || models.length || loading) return;
    setLoading(true);
    AI.listModels(backend ? { backend } : undefined)
      .then(setModels)
      .catch((e: Error) => toast(e.message, 5000))
      .finally(() => setLoading(false));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function choose(id: string) {
    onChange(id);
    setOpen(false);
  }

  return (
    <SettingRow title={title} sub={sub} origin={origin}>
      <div className="mdlpick" ref={boxRef}>
        <button type="button" className="fi mono mdlpick-btn" onClick={() => setOpen((v) => !v)}>
          <span className={"mdlpick-val" + (value ? "" : " placeholder")}>{value || placeholder || "choose a model…"}</span>
        </button>
        {open && (
          <div className="mdlpick-pop">
            <ModelPickerPanel models={models} loading={loading} backend={backend || ""} value={value} onChoose={choose} autoFocus />
          </div>
        )}
      </div>
    </SettingRow>
  );
}
