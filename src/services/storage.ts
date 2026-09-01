/* ============================================================================
 * storage.ts — the persistence boundary.
 *
 * Everything else in the app talks to `store.ts`, never to localStorage
 * directly. That keeps this the only file that needs to change if Drill ever
 * grows a real backend: swap the read/write pair below for `fetch` calls
 * against your API (e.g. GET/PUT /api/drill-db) and nothing else moves.
 *
 * Also home to the durability helpers, because "how safe is what we stored"
 * is the same question as "where did we store it". Browsers evict origin
 * storage: Safari discards unused site data after about a week, and clearing
 * site data takes everything. Months of memory and review history is the one
 * thing in this app that cannot be regenerated, so the app asks for
 * persistent storage on first run and can report what it was granted.
 * ========================================================================== */

const KEY = "mldrill:v3";
const KEY_OLD = "mldrill:v2";
/** Written once, immediately before the v3 -> v4 upgrade mutates anything. */
const KEY_BACKUP = "mldrill:v3:backup";

export function readCurrent(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function readLegacy(): string | null {
  try {
    return localStorage.getItem(KEY_OLD);
  } catch {
    return null;
  }
}

export function write(json: string): void {
  localStorage.setItem(KEY, json);
}

/* ------------------------------------------------------ migration backup -- */

/**
 * Keep a copy of the pre-migration bytes. Deliberately write-once: if the
 * upgrade produced something subtly wrong and the app has been used since,
 * the last thing anyone wants is that broken state overwriting the good
 * snapshot on the next load.
 *
 * Returns true when a backup was written by this call.
 */
export function writeBackupOnce(json: string): boolean {
  try {
    if (localStorage.getItem(KEY_BACKUP) != null) return false;
    localStorage.setItem(KEY_BACKUP, json);
    return true;
  } catch (e) {
    /* Out of quota, or storage is blocked. The caller decides whether to
       proceed; it must not be a silent success. */
    console.error("Could not write pre-migration backup", e);
    return false;
  }
}

export function readBackup(): string | null {
  try {
    return localStorage.getItem(KEY_BACKUP);
  } catch {
    return null;
  }
}

export function hasBackup(): boolean {
  return readBackup() != null;
}

/** Only ever called from an explicit "I have checked my data" action. */
export function clearBackup(): void {
  try {
    localStorage.removeItem(KEY_BACKUP);
  } catch {
    /* nothing to do */
  }
}

/* ------------------------------------------------------------ durability -- */

export interface StorageHealth {
  /** Browser has promised not to evict this origin's data. */
  persisted: boolean;
  /** False when the Storage API is missing entirely (older Safari). */
  supported: boolean;
  /** Bytes in use and available, when the browser will say. */
  usage: number | null;
  quota: number | null;
}

/**
 * Ask the browser to exempt this origin from eviction. Chrome grants it
 * silently for installed or frequently-visited sites, Firefox prompts, Safari
 * decides on its own. A refusal is normal and not an error — the app keeps
 * working, it just also keeps recommending an export.
 */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage || typeof navigator.storage.persist !== "function") return false;
    if (typeof navigator.storage.persisted === "function" && (await navigator.storage.persisted())) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function storageHealth(): Promise<StorageHealth> {
  const out: StorageHealth = { persisted: false, supported: false, usage: null, quota: null };
  try {
    if (!navigator.storage) return out;
    out.supported = typeof navigator.storage.persist === "function";
    if (typeof navigator.storage.persisted === "function") out.persisted = await navigator.storage.persisted();
    if (typeof navigator.storage.estimate === "function") {
      const e = await navigator.storage.estimate();
      out.usage = e.usage ?? null;
      out.quota = e.quota ?? null;
    }
  } catch {
    /* report what we managed to learn */
  }
  return out;
}

export const STORAGE_KEY = KEY;
export const BACKUP_KEY = KEY_BACKUP;
