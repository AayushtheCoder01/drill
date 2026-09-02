/* ============================================================================
 * GlobalScope — backend, key, model, appearance, scheduling and recall
 * defaults. The bottom of every inheritance chain: a project or conversation
 * that hasn't overridden a field falls all the way through to here.
 * ========================================================================== */
import { useEffect, useState } from "react";
import * as store from "@/services/store";
import * as storage from "@/services/storage";
import * as CFG from "@/lib/config";
import * as AI from "@/services/ai";
import { clamp } from "@/lib/util";
import { THEMES, applyAppearance } from "@/lib/theme";
import { useToast } from "@/context/ToastContext";
import { useDrillStore } from "@/hooks/useDrillStore";
import SwitchRow from "../ui/SwitchRow";
import AccentPicker from "../ui/AccentPicker";
import SecretRow from "../ui/SecretRow";
import ModelPicker from "../ui/ModelPicker";
import SelectRow from "../ui/SelectRow";
import type { Accent, BackendType, Density, Lang, Theme } from "@/types";

const RETENTION_OPTS: [number, string, string][] = [
  [0.85, "0.85", "lighter load"],
  [0.9, "0.90", "default"],
  [0.95, "0.95", "heavier, safer"]
];
const TEXT_SCALE_OPTS: [number, string][] = [
  [0.9, "Small"],
  [1, "Medium"],
  [1.15, "Large"]
];

export default function GlobalScope() {
  useDrillStore();
  const toast = useToast();
  const s = store.settings();

  const [backend, setBackend] = useState<BackendType | "">(s.backend as BackendType | "");
  const [key, setKey] = useState(s.key);
  const [baseUrl, setBaseUrl] = useState(s.baseUrl);
  const [model, setModel] = useState(s.model);
  const [newPerDay, setNewPerDay] = useState(String(s.newPerDay || 10));
  const [maxIvl, setMaxIvl] = useState(String(s.maxIvl || 365));
  const [tutor, setTutor] = useState(s.tutor || store.DEFAULT_TUTOR);
  const [testing, setTesting] = useState(false);
  const [outMsg, setOutMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [health, setHealth] = useState<storage.StorageHealth | null>(null);

  useEffect(() => {
    void storage.storageHealth().then(setHealth);
  }, []);

  const r = AI.resolve();
  const report = store.initReport();

  // The text fields above (backend/key/baseUrl/model/newPerDay/maxIvl/tutor)
  // are drafts, committed together by the Save button below. Everything
  // else here takes effect immediately through store.updateSettings, which
  // calls notify() — useDrillStore() at the top of this component is what
  // turns that into a re-render, so no local setTick counter is needed.
  function grabAndSave(extra?: Partial<typeof s>) {
    store.updateSettings({
      backend,
      key: key.trim(),
      model: model.trim(),
      baseUrl: baseUrl.trim(),
      newPerDay: clamp(parseInt(newPerDay, 10) || 10, 1, 200),
      maxIvl: clamp(parseInt(maxIvl, 10) || 365, 7, 3650),
      tutor: tutor.trim() || store.DEFAULT_TUTOR,
      ...extra
    });
  }

  function onBackendChange(v: string) {
    setBackend(v as BackendType | "");
    setBaseUrl("");
    grabAndSave({ backend: v as BackendType, baseUrl: "" } as Partial<typeof s>);
  }

  function test() {
    grabAndSave();
    setTesting(true);
    setOutMsg(null);
    AI.test()
      .then((out) => setOutMsg({ kind: "ok", text: out.trim().slice(0, 80) + " — connection works." }))
      .catch((e: Error) => setOutMsg({ kind: "err", text: e.message }))
      .finally(() => setTesting(false));
  }

  function toggle(key: "recall" | "mark" | "interleave" | "followups") {
    store.updateSettings({ [key]: !s[key] });
  }

  function setRetention(v: number) {
    store.updateSettings({ retention: v });
  }
  function setLang(v: Lang) {
    store.updateSettings({ lang: v });
  }
  function setTheme(v: Theme) {
    store.updateSettings({ theme: v });
    applyAppearance(store.settings());
  }
  function setAccent(v: Accent) {
    store.updateSettings({ accent: v });
    applyAppearance(store.settings());
  }
  function setDensity(v: Density) {
    store.updateSettings({ density: v });
    applyAppearance(store.settings());
  }
  function setTextScale(v: number) {
    store.updateSettings({ textScale: v });
    applyAppearance(store.settings());
  }

  function fmtBytes(n: number | null): string {
    if (n == null) return "unknown";
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(0) + " KB";
    return (n / 1024 / 1024).toFixed(1) + " MB";
  }

  const theme: Theme = s.theme === "day" ? "day" : "night";

  return (
    <div>
      <div className="srow">
        <span className="grow">
          <span className="t">Printing</span>
          <span className="s">
            Night is warm dark for evening sessions; Day is warm paper. Same design, same type — only the ink and the
            paper swap.
          </span>
        </span>
      </div>
      <div className="seg">
        {THEMES.map((t) => (
          <button key={t.id} className={theme === t.id ? "on" : ""} onClick={() => setTheme(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="srow">
        <span className="grow">
          <span className="t">Accent</span>
          <span className="s">The second ink: links, progress, and the one primary action on each screen.</span>
        </span>
      </div>
      <AccentPicker value={s.accent} theme={theme} onChange={setAccent} />

      <div className="srow">
        <span className="grow">
          <span className="t">Density and reading size</span>
          <span className="s">Density trims the chrome; reading size scales card, journal and chat text only.</span>
        </span>
      </div>

      <div className="seg">
        <button className={s.density === "comfortable" ? "on" : ""} onClick={() => setDensity("comfortable")}>
          Comfortable
        </button>
        <button className={s.density === "compact" ? "on" : ""} onClick={() => setDensity("compact")}>
          Compact
        </button>
      </div>
      <div className="seg">
        {TEXT_SCALE_OPTS.map(([v, label]) => (
          <button key={v} className={Math.abs((s.textScale || 1) - v) < 0.001 ? "on" : ""} onClick={() => setTextScale(v)}>
            {label}
          </button>
        ))}
      </div>

      <SelectRow
        title="Where inference runs"
        sub={r.backend.note}
        value={backend || r.type}
        onChange={onBackendChange}
        options={AI.BACKEND_ORDER.map((id) => ({ value: id, label: AI.BACKENDS[id].label }))}
      />

      <SecretRow
        title={`API key${r.backend.needsKey ? "" : " — optional here"}`}
        sub={r.keyFromConfig ? "A key is currently coming from your config file." : "Stored in this browser only, sent only to the backend above."}
        value={key}
        placeholder={r.keyFromConfig ? "set in config — leave blank to keep it" : "paste your key"}
        onChange={setKey}
      />

      <SettingsField label="Base URL — blank for the default" value={baseUrl} placeholder={r.backend.defaultBaseUrl} onChange={setBaseUrl} />

      <ModelPicker value={model} placeholder={r.backend.defaultModel} backend={backend || undefined} onChange={setModel} />

      <div className="btnrow" style={{ marginBottom: 18 }}>
        <button className="btn sm" disabled={testing} onClick={test}>
          Test connection
        </button>
      </div>
      {outMsg && (
        <div style={{ marginBottom: 18 }}>
          {outMsg.kind === "ok" ? (
            <div className="hintline" style={{ color: "var(--green)" }}>
              {outMsg.text}
            </div>
          ) : (
            <div className="err">{outMsg.text}</div>
          )}
        </div>
      )}

      <SwitchRow title="Write it before you flip" sub='Free recall beats recognising the answer. Ctrl+Enter checks.' on={s.recall} onToggle={() => toggle("recall")} />
      <SwitchRow title="AI marks what you wrote" sub="Compares your attempt to the card and suggests a grade." on={s.mark} onToggle={() => toggle("mark")} />
      <SwitchRow title="Interleave sections" sub="Avoids two cards from the same section back to back." on={s.interleave} onToggle={() => toggle("interleave")} />
      <SwitchRow
        title="Suggest follow-up questions"
        sub="Costs a second request after every reply. Off at low effort regardless."
        on={s.followups}
        onToggle={() => toggle("followups")}
      />

      <div className="srow">
        <span className="grow">
          <span className="t">Target retention</span>
          <span className="s">Higher means shorter intervals and more reviews.</span>
        </span>
      </div>
      <div className="seg" style={{ marginBottom: 16 }}>
        {RETENTION_OPTS.map(([v, label, note]) => (
          <button key={v} className={Math.abs((s.retention || 0.9) - v) < 0.001 ? "on" : ""} onClick={() => setRetention(v)}>
            {label} · {note}
          </button>
        ))}
      </div>

      <div className="srow">
        <span className="grow">
          <span className="t">Tutor language</span>
        </span>
      </div>
      <div className="seg" style={{ marginBottom: 16 }}>
        <button className={s.lang === "english" ? "on" : ""} onClick={() => setLang("english")}>
          English
        </button>
        <button className={s.lang === "hinglish" ? "on" : ""} onClick={() => setLang("hinglish")}>
          Hinglish
        </button>
      </div>

      <SettingsField label="New cards per day" value={newPerDay} onChange={setNewPerDay} type="number" />
      <SettingsField label="Longest interval — days" value={maxIvl} onChange={setMaxIvl} type="number" />
      <label className="f">Tutor style</label>
      <textarea className="fi" style={{ minHeight: 120 }} value={tutor} onChange={(e) => setTutor(e.target.value)} />

      <button className="btn pri" onClick={() => { grabAndSave(); toast("Saved"); }}>
        Save
      </button>

      <div className="hintline" style={{ marginTop: 20 }}>
        Config loaded from: {CFG.sources().join(", ")}.
        {report.migrated && ` Upgraded from v${report.fromVersion} on this load${report.backedUp ? " — a pre-upgrade backup was kept." : "."}`}
      </div>
      {health && (
        <div className="hintline">
          {health.persisted ? "Storage is persistent." : health.supported ? "Storage is not persistent — keep a backup." : "This browser will not say whether storage is safe from eviction."}
          {health.usage != null && ` Using ${fmtBytes(health.usage)}${health.quota != null ? ` of ${fmtBytes(health.quota)}` : ""}.`}
        </div>
      )}
    </div>
  );
}

/** A one-off text/number field — everything else in this scope has moved to
 *  the shared row primitives, but a couple of plain fields didn't earn one. */
function SettingsField({
  label,
  value,
  placeholder,
  type,
  onChange
}: {
  label: string;
  value: string;
  placeholder?: string;
  type?: "text" | "number";
  onChange: (v: string) => void;
}) {
  return (
    <>
      <label className="f">{label}</label>
      <input className="fi mono" type={type || "text"} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </>
  );
}
