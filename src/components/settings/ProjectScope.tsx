/* ============================================================================
 * ProjectScope — name, blurb, goals, defaults handed down to conversations,
 * memory policy, always-attached knowledge, and which decks belong here.
 *
 * Replaces the window.prompt sequence ProjectSwitcher used to edit a project
 * with — same data, a real form.
 * ========================================================================== */
import { useEffect, useRef, useState } from "react";
import * as store from "@/services/store";
import * as projects from "@/services/projects";
import * as AI from "@/services/ai";
import { PERSONAS } from "@/lib/personas";
import { useDrillStore } from "@/hooks/useDrillStore";
import { useToast } from "@/context/ToastContext";
import SelectRow from "../ui/SelectRow";
import ModelPicker from "../ui/ModelPicker";
import NumberRow from "../ui/NumberRow";
import type { Autonomy, BackendType, Effort } from "@/types";
import Icon from "../ui/Icon";

export default function ProjectScope({ projectId }: { projectId: string }) {
  useDrillStore();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const p = store.projects()[projectId];

  const [name, setName] = useState(p?.name || "");
  const [blurb, setBlurb] = useState(p?.blurb || "");
  const [goals, setGoals] = useState(p?.goals || "");
  const [knowledgeText, setKnowledgeText] = useState("");
  const [knowledgeName, setKnowledgeName] = useState("");

  useEffect(() => {
    setName(p?.name || "");
    setBlurb(p?.blurb || "");
    setGoals(p?.goals || "");
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!p) return <div className="empty">Project not found.</div>;

  function saveIdentity() {
    if (name.trim()) projects.rename(projectId, name);
    projects.update(projectId, { blurb: blurb.trim(), goals: goals.trim() });
    toast("Saved");
  }

  function addKnowledgeText() {
    if (!knowledgeText.trim()) return;
    projects.addKnowledge(projectId, knowledgeName.trim() || "Note", "text", knowledgeText.trim());
    setKnowledgeText("");
    setKnowledgeName("");
    toast("Added to project knowledge");
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      projects.addKnowledge(projectId, f.name, "file", String(rd.result));
      toast("Added " + f.name);
    };
    rd.readAsText(f);
  }

  const decks = store.decksOf(projectId);
  const otherProjects = Object.values(store.projects()).filter((x) => x.id !== projectId && !x.archived);

  return (
    <div>
      <label className="f">Name</label>
      <input className="fi" value={name} onChange={(e) => setName(e.target.value)} />
      <label className="f">Blurb — shown under the name in the switcher</label>
      <input className="fi" value={blurb} onChange={(e) => setBlurb(e.target.value)} />
      <label className="f">Goals — injected as the project header on every chat turn</label>
      <textarea className="fi" style={{ minHeight: 70 }} value={goals} onChange={(e) => setGoals(e.target.value)} placeholder='e.g. "Understand ML well enough to implement from scratch."' />
      <button className="btn pri sm" style={{ marginBottom: 20 }} onClick={saveIdentity}>
        Save
      </button>

      <label className="f" style={{ marginTop: 4 }}>
        Defaults for new conversations in this project
      </label>
      <SelectRow
        title="Backend"
        value={p.defaults.backend}
        placeholder="Inherit from global"
        onChange={(v) => projects.updateDefaults(projectId, { backend: v as BackendType | "" })}
        options={AI.BACKEND_ORDER.map((id) => ({ value: id, label: AI.BACKENDS[id].label }))}
      />
      <ModelPicker
        title="Model"
        value={p.defaults.model}
        placeholder="Inherit from global"
        backend={p.defaults.backend || undefined}
        onChange={(v) => projects.updateDefaults(projectId, { model: v })}
      />
      <SelectRow
        title="Persona"
        value={p.defaults.personaId}
        placeholder="Inherit (Tutor)"
        onChange={(v) => projects.updateDefaults(projectId, { personaId: v })}
        options={PERSONAS.map((pr) => ({ value: pr.id, label: pr.name }))}
      />
      <SelectRow
        title="Effort"
        value={p.defaults.effort}
        placeholder="Inherit from global"
        onChange={(v) => projects.updateDefaults(projectId, { effort: v as Effort | "" })}
        options={[
          { value: "low", label: "Low" },
          { value: "medium", label: "Medium" },
          { value: "high", label: "High" }
        ]}
      />

      <label className="f" style={{ marginTop: 4 }}>
        Memory policy
      </label>
      <SelectRow
        title="Autonomy"
        sub="How freely memory may be written without being asked."
        value={p.memoryPolicy.autonomy}
        onChange={(v) => projects.updateMemoryPolicy(projectId, { autonomy: v as Autonomy })}
        options={[
          { value: "manual", label: "Manual — nothing without review" },
          { value: "assisted", label: "Assisted — stated facts commit, the rest waits" },
          { value: "auto", label: "Auto" }
        ]}
      />
      <NumberRow
        title="Max global memories injected per turn"
        value={p.memoryPolicy.maxGlobalInjected}
        min={0}
        max={20}
        onChange={(v) => projects.updateMemoryPolicy(projectId, { maxGlobalInjected: v })}
      />
      <NumberRow
        title="Max project memories injected per turn"
        value={p.memoryPolicy.maxProjectInjected}
        min={0}
        max={30}
        onChange={(v) => projects.updateMemoryPolicy(projectId, { maxProjectInjected: v })}
      />

      <label className="f" style={{ marginTop: 4 }}>
        Knowledge — always attached to this project's conversations ({p.knowledge.length})
      </label>
      <div className="list" style={{ marginBottom: 12 }}>
        {p.knowledge.map((k) => (
          <div key={k.id} className="item" style={{ cursor: "default" }}>
            <span className="grow">
              <span className="t">{k.name}</span>
              <span className="s">
                {k.kind} · {k.size.toLocaleString()} chars{!k.enabled ? " · off" : ""}
              </span>
            </span>
            <button className="linkbtn" onClick={() => projects.setKnowledgeEnabled(projectId, k.id, !k.enabled)}>
              {k.enabled ? "disable" : "enable"}
            </button>
            <span className="x" onClick={() => projects.removeKnowledge(projectId, k.id)}>
              <Icon name="close" size={12} />
            </span>
          </div>
        ))}
        {!p.knowledge.length && <div className="empty">Nothing attached yet.</div>}
      </div>
      <input className="fi" placeholder="name (optional)" value={knowledgeName} onChange={(e) => setKnowledgeName(e.target.value)} />
      <textarea className="fi" placeholder="paste text to keep attached to every conversation here" value={knowledgeText} onChange={(e) => setKnowledgeText(e.target.value)} />
      <div className="btnrow" style={{ marginBottom: 20 }}>
        <button className="btn sm" onClick={addKnowledgeText}>
          Add text
        </button>
        <button className="btn sm" onClick={() => fileRef.current?.click()}>
          Add a file…
        </button>
      </div>
      <input ref={fileRef} type="file" accept=".md,.txt,text/plain,text/markdown" style={{ display: "none" }} onChange={onFile} />

      <label className="f">Decks in this project ({decks.length})</label>
      <div className="list" style={{ marginBottom: 20 }}>
        {decks.map((d) => (
          <div key={d.id} className="item" style={{ cursor: "default" }}>
            <span className="grow">
              <span className="t">{d.name}</span>
              <span className="s">{d.cards.length} cards</span>
            </span>
            {otherProjects.length > 0 && (
              <select
                className="fi"
                style={{ margin: 0, width: "auto" }}
                value=""
                onChange={(e) => {
                  if (e.target.value) store.setDeckProject(d.id, e.target.value);
                }}
              >
                <option value="">Move to…</option>
                {otherProjects.map((op) => (
                  <option key={op.id} value={op.id}>
                    {op.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
