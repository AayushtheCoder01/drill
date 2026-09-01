export default function Bars({ vals, labels }: { vals: number[]; labels: string[] }) {
  const max = Math.max(...vals, 1);
  return (
    <>
      <div className="bars">
        {vals.map((v, i) => (
          <div
            key={i}
            className={"bar" + (i === 0 ? " hot" : "")}
            style={{ height: Math.max(3, Math.round((v / max) * 100)) + "%" }}
            title={String(v)}
          ></div>
        ))}
      </div>
      <div className="barlbls">
        {labels.map((l, i) => (
          <span key={i} dangerouslySetInnerHTML={{ __html: l + "<br>" + vals[i] }}></span>
        ))}
      </div>
    </>
  );
}
