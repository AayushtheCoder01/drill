import type { ReactNode } from "react";

/** The shared shell every settings row sits in: title, optional subtitle,
 *  an optional provenance badge ("from Project"), and the control itself. */
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
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <label className="f" style={{ margin: 0 }}>
          {title}
        </label>
        {origin && (
          <span className="tagmini" style={{ margin: 0 }}>
            {origin}
          </span>
        )}
      </div>
      {sub && <div className="hintline" style={{ margin: "2px 0 8px" }}>{sub}</div>}
      {children}
    </div>
  );
}
