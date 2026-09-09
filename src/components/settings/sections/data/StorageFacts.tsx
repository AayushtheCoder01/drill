/* ============================================================================
 * StorageFacts — what you have made, where it is, and how safe it is there.
 *
 * Deliberately the first thing on the Data page rather than a footnote under
 * the export buttons. "All of this lives in one browser" lands as a warning
 * only once you can see how much of it there is.
 * ========================================================================== */
import { useEffect, useState } from "react";
import * as store from "@/services/store";
import * as storage from "@/services/storage";
import { useDrillStore } from "@/hooks/useDrillStore";
import { fmtBytes } from "@/lib/util";
import Section from "../../Section";

export default function StorageFacts() {
  useDrillStore();
  const [health, setHealth] = useState<storage.StorageHealth | null>(null);
  const report = store.initReport();

  useEffect(() => {
    void storage.storageHealth().then(setHealth);
  }, []);

  const db = store.get();
  const nDecks = Object.keys(db.decks).length;
  const nCards = Object.values(db.decks).reduce((n, d) => n + d.cards.length, 0);
  const nProjects = Object.keys(db.projects).length;

  return (
    <Section id="data.storage">
      <div className="sset-facts">
        <div>
          <b>{nProjects}</b>
          <span>projects</span>
        </div>
        <div>
          <b>{nDecks}</b>
          <span>decks</span>
        </div>
        <div>
          <b>{nCards}</b>
          <span>cards</span>
        </div>
        <div>
          <b>{fmtBytes(health?.usage ?? null)}</b>
          <span>on disk</span>
        </div>
      </div>

      {health && (
        <p className={"sset-note" + (health.persisted ? " ok" : " warn")}>
          {health.persisted
            ? "Storage is marked persistent — the browser has agreed not to evict it to reclaim space."
            : health.supported
              ? "Storage is not persistent. The browser may clear it to reclaim space, so keep a backup."
              : "This browser will not say whether storage is safe from eviction. Keep a backup."}
          {health.quota != null && ` Quota is about ${fmtBytes(health.quota)}.`}
        </p>
      )}

      {/* A browser origin is per-port as well as per-host, so moving between
          two dev servers, or between a local build and a deployed one, looks
          exactly like losing everything. Saying so here is cheaper than
          working it out at the moment of panic. */}
      <p className="sset-note">
        Storage belongs to this exact address — {window.location.origin} — and not to you. A different port, a
        different domain or a private window is a different, empty Drill. Moving between them is what the backup
        below is for.
      </p>

      {report.migrated && (
        <p className="sset-note">
          Upgraded from database v{report.fromVersion} on this load
          {report.backedUp ? " — a pre-upgrade backup was kept." : "."}
        </p>
      )}
    </Section>
  );
}
