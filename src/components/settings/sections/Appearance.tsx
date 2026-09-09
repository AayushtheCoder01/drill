/* ============================================================================
 * Appearance — the two printings, the second ink, and how much of the page
 * the chrome is allowed to take.
 * ========================================================================== */
import * as store from "@/services/store";
import { THEMES, applyAppearance } from "@/lib/theme";
import { useDrillStore } from "@/hooks/useDrillStore";
import AccentPicker from "../../ui/AccentPicker";
import Section from "../Section";
import type { Accent, Density, Theme } from "@/types";

const TEXT_SCALE_OPTS: [number, string][] = [
  [0.9, "Small"],
  [1, "Medium"],
  [1.15, "Large"]
];

export default function Appearance() {
  useDrillStore();
  const s = store.settings();
  const theme: Theme = s.theme === "day" ? "day" : "night";

  /** Appearance is the one group that has to be pushed at the document as
   *  well as stored: the tokens live on :root, not in React. */
  function apply<K extends keyof typeof s>(patch: Pick<typeof s, K>) {
    store.updateSettings(patch);
    applyAppearance(store.settings());
  }

  return (
    <>
      <Section id="appearance.printing">
        <div className="seg">
          {THEMES.map((t) => (
            <button key={t.id} className={theme === t.id ? "on" : ""} onClick={() => apply({ theme: t.id })}>
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
        <AccentPicker value={s.accent} theme={theme} onChange={(v: Accent) => apply({ accent: v })} />
      </Section>

      <Section id="appearance.density">
        <div className="seg">
          {(["comfortable", "compact"] as Density[]).map((d) => (
            <button key={d} className={s.density === d ? "on" : ""} onClick={() => apply({ density: d })}>
              {d[0].toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>
        <div className="seg">
          {TEXT_SCALE_OPTS.map(([v, label]) => (
            <button
              key={v}
              className={Math.abs((s.textScale || 1) - v) < 0.001 ? "on" : ""}
              onClick={() => apply({ textScale: v })}
            >
              {label}
            </button>
          ))}
        </div>
      </Section>
    </>
  );
}
