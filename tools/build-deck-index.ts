/* Rebuild public/decks/examples/index.json from whatever .json decks are in
 * that folder. The app's "Example decks" browser reads that index.
 *
 * Descriptions are preserved across runs, so adding a deck does not wipe the
 * blurbs already written for the others.
 *
 * Usage:  npm run deck:index
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, "..", "public", "decks", "examples");
const indexPath = path.join(dir, "index.json");

interface IndexEntry {
  file: string;
  name: string;
  cards: number;
  description: string;
}

const previous: Record<string, string> = {};
try {
  (JSON.parse(fs.readFileSync(indexPath, "utf8")) as IndexEntry[]).forEach((e) => {
    previous[e.file] = e.description || "";
  });
} catch {
  /* no index yet */
}

const entries: IndexEntry[] = fs
  .readdirSync(dir)
  .filter((f: string) => f.endsWith(".json") && f !== "index.json")
  .sort()
  .map((file: string) => {
    const deck = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    const cards = Array.isArray(deck) ? deck : deck.cards;
    if (!Array.isArray(cards)) throw new Error(file + ": no cards array");
    const bad = cards.findIndex((c: any) => !c || !c.q || !c.a);
    if (bad >= 0) throw new Error(file + ": card " + (bad + 1) + " is missing q or a");
    return {
      file,
      name: (Array.isArray(deck) ? null : deck.name) || file.replace(/\.json$/, ""),
      cards: cards.length,
      description: previous[file] || ""
    };
  });

fs.writeFileSync(indexPath, JSON.stringify(entries, null, 1) + "\n", "utf8");
console.log("wrote public/decks/examples/index.json — " + entries.length + " decks");
entries.forEach((e) => console.log("  " + e.file + "  " + e.cards + " cards" + (e.description ? "" : "   (no description yet)")));
