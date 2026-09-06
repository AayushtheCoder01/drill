import SettingRow from "./SettingRow";

export default function NumberRow({
  title,
  sub,
  origin,
  value,
  min,
  max,
  step,
  onChange
}: {
  title: string;
  sub?: string;
  origin?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <SettingRow title={title} sub={sub} origin={origin}>
      <input
        className="fi mono"
        type="number"
        min={min}
        max={max}
        step={step ?? 1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </SettingRow>
  );
}
