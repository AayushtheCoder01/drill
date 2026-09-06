/* ============================================================================
 * ProjectScope — what this space is, what it hands down to conversations
 * started inside it, what it is allowed to remember, and what it owns.
 *
 * Replaces the window.prompt sequence ProjectSwitcher used to edit a project
 * with — same data, a real form.
 *
 * The personal space arrives here too, and reads differently on purpose. It
 * has no goals, because it is not aimed at anything; the same field is the
 * standing instruction for chats that belong to nothing, which is a different
 * sentence for the same box. Its name and blurb are fixed, and it owns no
 * decks worth listing, so those parts are simply not offered rather than
 * offered and ignored.
 * ========================================================================== */
import { useRef, useState } from "react";
import * as store from "@/services/store";
import * as projects from "@/services/projects";
import * as AI from "@/services/ai";
import { PERSONAS } from "@/lib/personas";
import { useDrillStore } from "@/hooks/useDrillStore";
import { useToast } from "@/context/ToastContext";
import SelectRow from "../ui/SelectRow";
import ModelPicker from "../ui/ModelPicker";
import NumberRow from "../ui/NumberRow";
import TextRow from "../ui/TextRow";
import Section from "./Section";
import type { Autonomy, BackendType, Effort } from "@/types";
import Icon from "../ui/Icon";

export default function ProjectScope({ projectId }: { projectId: string }) {
  useDrillStore();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [knowledgeText, setKnowledgeText] = useState("");
  const [knowledgeName, setKnowledgeName] = useState("");

  const p = store.projects()[projectId];
  if (!p) return <div className="empty">Project not found.</div>;

  const personal = projects.isPersonalProject(projectId);

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
    <>
      <Section
        title={personal ? "Personal" : "This project"}
        sub={
          personal
            ? "The space for chats that belong to nothing. It is always here and cannot be archived."
            : "The name in the switcher, and the one line of purpose that rides on every chat turn started here."
        }
      >
        {!personal && (
          <>
            <TextRow title="Name" value={p.name} onCommit={(v) => v.trim() && projects.rename(projectId, v)} />
            <TextRow
              title="Blurb"
              sub="Shown under the name in the switcher."
              value={p.blurb}
              onCommit={(v) => projects.update(projectId, { blurb: v.trim() })}
            />
          </>
        )}
        <TextRow
          title={personal ? "Standing instruction" : "Goals"}
          sub={
            personal
              ? "Prepended to every personal chat. What you want the assistant to know about you, in one paragraph."
              : "Injected as the project header on every chat turn, so keep it short."
          }
          value={p.goals}
          multiline
          placeholder={
            personal
              ? "e.g. I write TypeScript. Answer in code first, prose second."
              : 'e.g. "Understand ML well enough to implement from scratch."'
          }
          onCommit={(v) => projects.update(projectId, { goals: v.trim() })}
        />
      </Section>

      <Section
        title="Defaults here"
        sub="What a new conversation in this space starts from. Blank falls through to the global setting; a thread can override either."
      >
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
      </Section>

      <Section title="Memory here" sub="A space can be stricter than the global policy, never looser.">
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
      </Section>

      <Section
        title={`Knowledge (${p.knowledge.length})`}
        sub="Attached to every conversation here, on every message. Pay for it once and it is always in front of the model — which also means you pay for it on every message."
      >
        <div className="list setlist">
          {p.knowledge.map((k) => (
            <div key={k.id} className="item static">
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
        <textarea
          className="fi"
          placeholder="paste text to keep attached to every conversation here"
          value={knowledgeText}
          onChange={(e) => setKnowledgeText(e.target.value)}
        />
        <div className="btnrow">
          <button className="btn sm" onClick={addKnowledgeText}>
            Add text
          </button>
          <button className="btn sm" onClick={() => fileRef.current?.click()}>
            Add a file…
          </button>
        </div>
        <input ref={fileRef} type="file" accept=".md,.txt,text/plain,text/markdown" className="hidden-file" onChange={onFile} />
      </Section>

      {!personal && (
        <Section title={`Decks (${decks.length})`} sub="What this project owns. Moving a deck takes its cards and its scheduling with it.">
          <div className="list setlist">
            {decks.map((d) => (
              <div key={d.id} className="item static">
                <span className="grow">
                  <span className="t">{d.name}</span>
                  <span className="s">{d.cards.length} cards</span>
                </span>
                {otherProjects.length > 0 && (
                  <select
                    className="fi auto"
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
        </Section>
      )}
    </>
  );
}
