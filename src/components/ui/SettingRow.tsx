import type { ReactNode } from "react";

/** The shared shell every settings row sits in: title, optional subtitle,
 *  an optional provenance badge ("from Project"), and the control itself.
 *
 *  The look was inline `style={{}}` props until the settings rework, which is
 *  the one thing CONTRIBUTING forbids outright — a component may set a
 *  measured value inline, never a look. It is `.setrow` in style.css now. */
export default function SettingRow({
  title,
  sub,
  origin,
  children
}: {
  title: string;
  sub?: string;
  origin?: string;
  children: ReactNode;
}) {
  return (
    <div className="setrow">
      <div className="setrow-head">
        <label className="f">{title}</label>
        {origin && <span className="tagmini">{origin}</span>}
      </div>
      {sub && <div className="setrow-sub">{sub}</div>}
      {children}
    </div>
  );
}
