/* ============================================================================
 * Connection — where inference runs, and the credential to get there.
 *
 * First category in the list because it is the one that decides whether the
 * app does anything at all. It used to sit two thirds of the way down a flat
 * column, under the accent picker.
 * ========================================================================== */
import { useState } from "react";
import * as store from "@/services/store";
import * as CFG from "@/lib/config";
import * as AI from "@/services/ai";
import { useDrillStore } from "@/hooks/useDrillStore";
import SecretRow from "../../ui/SecretRow";
import ModelPicker from "../../ui/ModelPicker";
import SelectRow from "../../ui/SelectRow";
import TextRow from "../../ui/TextRow";
import Section from "../Section";
import type { BackendType } from "@/types";

export default function Connection() {
  useDrillStore();
  const s = store.settings();
  const [testing, setTesting] = useState(false);
  const [outMsg, setOutMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const r = AI.resolve();

  /** Every credential field goes through here so the per-backend vault is
   *  mirrored on the same write. Without rememberCreds() the fields would
   *  save but switching provider and back would hand you the previous ones. */
  function save(patch: Partial<typeof s>) {
    store.updateSettings(patch);
    store.rememberCreds();
  }

  /* Changing provider used to blank the base URL and carry the key across,
     which meant pasting a key for the new backend overwrote the old one's —
     switch to Groq, come back to OpenRouter, and that key was gone.
     store.setBackend() is the only thing allowed to move settings.backend: it
     files the outgoing backend's three fields away and hands back the
     incoming one's, and assigning through updateSettings would skip that and
     destroy a key. */
  function onBackendChange(v: string) {
    store.setBackend(v);
    setOutMsg(null);
  }

  function test() {
    setTesting(true);
    setOutMsg(null);
    AI.test()
      .then((out) => setOutMsg({ kind: "ok", text: out.trim().slice(0, 80) + " — connection works." }))
      .catch((e: Error) => setOutMsg({ kind: "err", text: e.message }))
      .finally(() => setTesting(false));
  }

  return (
    <>
    <Section id="connection.provider">
      <SelectRow
        title="Where inference runs"
        sub={r.backend.note}
        value={s.backend || r.type}
        onChange={onBackendChange}
        options={AI.BACKEND_ORDER.map((id) => ({ value: id, label: AI.BACKENDS[id].label }))}
      />

      <SecretRow
        title={`API key${r.backend.needsKey ? "" : " — optional here"}`}
        sub={
          r.keyFromConfig
            ? "A key is currently coming from your config file."
            : "Stored in this browser only, sent only to the backend above."
        }
        value={s.key}
        placeholder={r.keyFromConfig ? "set in config — leave blank to keep it" : "paste your key"}
        onChange={(v) => save({ key: v.trim() })}
      />
      {r.backend.needsKey && !s.key && !r.keyFromConfig && r.backend.keyUrl && (
        <p className="sset-note">
          Get one at{" "}
          <a href={r.backend.keyUrl} target="_blank" rel="noreferrer">
            {r.backend.keyUrl.replace(/^https?:\/\//, "")}
          </a>
          .
        </p>
      )}

      <TextRow
        title="Base URL"
        sub="Blank uses the provider's own."
        value={s.baseUrl}
        placeholder={r.backend.defaultBaseUrl}
        mono
        onCommit={(v) => save({ baseUrl: v.trim() })}
      />

      <div className="btnrow">
        <button className="btn sm" disabled={testing} onClick={test}>
          {testing ? "Testing…" : "Test connection"}
        </button>
      </div>
      {outMsg &&
        (outMsg.kind === "ok" ? (
          <p className="sset-note ok">{outMsg.text}</p>
        ) : (
          <div className="err">{outMsg.text}</div>
        ))}

      <p className="sset-note">Config loaded from: {CFG.sources().join(", ")}.</p>
    </Section>

    <Section id="connection.model">
      <ModelPicker
        title="Model"
        value={s.model}
        placeholder={r.backend.defaultModel}
        backend={(s.backend as BackendType) || undefined}
        onChange={(v) => save({ model: v.trim() })}
      />
    </Section>
    </>
  );
}
