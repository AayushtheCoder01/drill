export default function SwitchRow({
  title,
  sub,
  on,
  onToggle
}: {
  title: string;
  sub: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="srow">
      <span className="grow">
        <span className="t">{title}</span>
        <span className="s">{sub}</span>
      </span>
      <button className={"sw" + (on ? " on" : "")} aria-pressed={on} onClick={onToggle}></button>
    </div>
  );
}
