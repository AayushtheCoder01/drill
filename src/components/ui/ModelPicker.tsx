import { useState } from "react";
import * as AI from "@/services/ai";
import { useToast } from "@/context/ToastContext";
import SettingRow from "./SettingRow";
import type { BackendType } from "@/types";

/** A model text input backed by a datalist that fills in from "Load model
 *  list", plus the fetch button itself — shared by every scope that lets you
 *  type a model id (global, project, conversation). */
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
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const listId = "models-" + Math.random().toString(36).slice(2, 8);

  function load() {
    setLoading(true);
    AI.listModels(backend ? { backend } : undefined)
      .then((ids) => {
        setModels(ids);
        toast(ids.length + " models loaded");
      })
      .catch((e: Error) => toast(e.message, 5000))
      .finally(() => setLoading(false));
  }

  return (
    <SettingRow title={title} sub={sub} origin={origin}>
      <input className="fi mono" style={{ marginBottom: 8 }} list={listId} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
      <datalist id={listId}>
        {models.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <button className="btn sm" type="button" disabled={loading} onClick={load}>
        {loading ? "Loading…" : "Load model list"}
      </button>
    </SettingRow>
  );
}
