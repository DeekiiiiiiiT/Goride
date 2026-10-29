import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const raw = fs.readFileSync(0, "utf8");
const payload = JSON.parse(raw);
if (!payload.html?.trim()) {
  console.error("stdin JSON missing html");
  process.exit(1);
}
const out = path.join(root, "docs/stitch/dominion-redesign/html/P7-price-engine-settings.html");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, payload.html, "utf8");
console.log("Wrote", out, payload.html.length, "bytes");
