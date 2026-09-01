import { useState } from "react";
import SettingRow from "./SettingRow";

export default function SecretRow({
  title,
  sub,
  origin,
  value,
  placeholder,
  onChange
}: {
  title: string;
  sub?: string;
  origin?: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <SettingRow title={title} sub={sub} origin={origin}>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          className="fi mono"
          style={{ marginBottom: 0, flex: 1 }}
          type={show ? "text" : "password"}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button className="btn sm" type="button" onClick={() => setShow((v) => !v)}>
          {show ? "Hide" : "Show"}
        </button>
      </div>
    </SettingRow>
  );
}
