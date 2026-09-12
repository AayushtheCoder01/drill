/* ============================================================================
 * voices.ts — the voices this browser has, as a store.
 *
 * `speechSynthesis.getVoices()` is the least predictable call in the Web
 * Speech API. Chrome returns an empty list the first time and fires
 * `voiceschanged` once the real one is ready; Firefox on desktop answers at
 * once and never fires the event; some Linux builds have no voices at all.
 *
 * So the list is held here in three states — still loading (null), loaded
 * and empty, loaded — and settles within two seconds whatever the browser
 * does, so "loading" is never what anyone is left looking at. Reading starts
 * on the first subscription rather than at import, so a view that never
 * offers a voice never touches the API.
 * ========================================================================== */

let voices: SpeechSynthesisVoice[] | null = null;
let version = 0;
let started = false;
const listeners = new Set<() => void>();

function notify(): void {
  version++;
  listeners.forEach((l) => l());
}

export function supported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}

function read(): void {
  try {
    const got = window.speechSynthesis.getVoices();
    /* Chrome's first answer is an empty list that means "not yet", so an
       empty list only counts once something has already been learned. */
    if (got.length || voices !== null) {
      voices = got;
      notify();
    }
  } catch {
    voices = [];
    notify();
  }
}

function ensure(): void {
  if (started || !supported()) return;
  started = true;
  const synth = window.speechSynthesis;
  synth.addEventListener("voiceschanged", read);
  read();
  setTimeout(() => {
    if (voices !== null) return;
    try {
      voices = synth.getVoices();
    } catch {
      voices = [];
    }
    notify();
  }, 2000);
}

export function subscribe(fn: () => void): () => void {
  ensure();
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getVersion(): number {
  return version;
}

/** The browser's voices, or null while it is still deciding. */
export function list(): SpeechSynthesisVoice[] | null {
  return supported() ? voices : [];
}

export function find(voiceURI: string): SpeechSynthesisVoice | undefined {
  return voices?.find((v) => v.voiceURI === voiceURI);
}
