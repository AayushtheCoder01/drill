import SettingRow from "./SettingRow";

export default function SelectRow({
  title,
  sub,
  origin,
  value,
  options,
  placeholder,
  onChange
}: {
  title: string;
  sub?: string;
  origin?: string;
  value: string;
  options: { value: string; label: string }[];
  /** Shown as the empty-value option — typically "Inherit (…)". */
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <SettingRow title={title} sub={sub} origin={origin}>
      <select className="fi" style={{ marginBottom: 0 }} value={value} onChange={(e) => onChange(e.target.value)}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </SettingRow>
  );
}
