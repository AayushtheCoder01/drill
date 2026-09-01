/* Regenerate public/decks/examples/ml-course1.json from src/lib/seed.ts so
 * the importable copy and the built-in starter deck can never drift apart.
 *
 * Usage:  npm run seed:json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SEED_DECK } from "../src/lib/seed";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const out = { name: SEED_DECK.name, cards: SEED_DECK.cards };
const dest = path.join(root, "public", "decks", "examples", "ml-course1.json");

fs.writeFileSync(dest, JSON.stringify(out, null, 1) + "\n", "utf8");
console.log("wrote " + path.relative(root, dest) + " — " + out.cards.length + " cards");
