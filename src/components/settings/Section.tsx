import type { ReactNode } from "react";

/** A headed group of settings.
 *
 *  Settings used to be one flat column: theme, then accent, then the API key,
 *  then five switches, then the scheduler, then a tutor prompt — fifteen
 *  controls with nothing to say which of them belonged together, so finding
 *  one meant reading all of them. A heading and a sentence per group is the
 *  cheapest possible fix and most of the difference. */
export default function Section({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="sset">
      <h4 className="sset-h">{title}</h4>
      {sub && <p className="sset-s">{sub}</p>}
      {children}
    </section>
  );
}
