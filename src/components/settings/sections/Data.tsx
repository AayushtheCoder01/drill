/* ============================================================================
 * Data — where everything you have made is kept, and how safe it is there.
 *
 * The three lines here used to be a footer under the Save button in fine
 * print. They are the answer to "can I lose all this", which is worth a
 * heading of its own in an app with no account and no server.
 * ========================================================================== */
import { useEffect, useState } from "react";
import * as store from "@/services/store";
import * as storage from "@/services/storage";
import { useDrillStore } from "@/hooks/useDrillStore";
import Section from "../Section";

function fmtBytes(n: number | null): string {
  if (n == null) return "unknown";
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + " KB";
  return (n / 1024 / 1024).toFixed(1) + " MB";
}

export default function Data() {
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
    <Section
      title="Your data"
      sub="All of it lives in this browser. No account, no server, nothing uploaded — which is the point, and also the risk."
    >
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
              ? "Storage is not persistent. The browser may clear it to reclaim space, so keep a backup — Menu → Import / export."
              : "This browser will not say whether storage is safe from eviction. Keep a backup."}
          {health.quota != null && ` Quota is about ${fmtBytes(health.quota)}.`}
        </p>
      )}

      {report.migrated && (
        <p className="sset-note">
          Upgraded from database v{report.fromVersion} on this load
          {report.backedUp ? " — a pre-upgrade backup was kept." : "."}
        </p>
      )}
    </Section>
  );
}
