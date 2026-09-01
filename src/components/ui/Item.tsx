import Icon from "./Icon";

/** A row in a ruled list. The trailing affordance is its own class, not the
 *  `.x` that delete buttons use — that one goes red on hover, which is a
 *  strange thing for "open this" to do. */
export default function Item({
  title,
  sub,
  chev,
  onClick
}: {
  title: string;
  sub: string;
  chev?: string;
  onClick: () => void;
}) {
  return (
    <button className="item" onClick={onClick}>
      <span className="grow">
        <span className="t">{title}</span>
        <span className="s">{sub}</span>
      </span>
      <span className="go">{chev || <Icon name="chevron" size={14} />}</span>
    </button>
  );
}
