/* ============================================================================
 * Sources — where a web-search reply got its answer.
 *
 * Deliberately a plain numbered list under the reply rather than markers
 * woven into the prose. The backend reports character offsets, but the reply
 * is rendered markdown by then and splicing into generated HTML is exactly
 * what CONTRIBUTING forbids; a list costs nothing and cannot corrupt the
 * document.
 * ========================================================================== */
import type { Citation } from "@/types";

/** example.com from https://example.com/a/b?c — the part worth reading at a
 *  glance. Falls back to the raw url if it will not parse. */
function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default function Sources({ citations }: { citations: Citation[] }) {
  if (!citations.length) return null;
  return (
    <div className="sources">
      <div className="sources-head">
        {citations.length} {citations.length === 1 ? "source" : "sources"}
      </div>
      <ol className="sources-list">
        {citations.map((c, i) => (
          <li key={c.url + i}>
            <a href={c.url} target="_blank" rel="noopener noreferrer nofollow" title={c.url}>
              {c.title}
            </a>
            <span className="sources-host">{host(c.url)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
