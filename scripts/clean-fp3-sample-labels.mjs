/** Remove real shipped UI copy from FP3 overlay skip lists (fleet-find-parts audit O4). */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const path = join(import.meta.dirname, "..", "docs", "stitch", "roam-fleet-app", "sample-labels.json");
const j = JSON.parse(readFileSync(path, "utf8"));

const removeFrom = {
  FP3b: [
    "can't see your part? search for it by name.",
    "search instead",
    "pick the part you need for your 2019",
    "4 parts in this area",
    "2 on file for your car",
    "4 parts on file",
    "what part do you need?",
    "by area",
  ],
  FP3c: [
    "navigate",
    "dismiss",
    "opening which side? …",
    "which side?",
    "pick the part you need for your 2019",
    "roomy",
    "4 on file",
    "2 on file",
  ],
  FP12b: [
    "ask roam to add it",
    "pick another part",
    "parts in this area",
    "on file for your car",
    "move between rows",
    "enter picks",
    "esc closes",
    "not on file for your car yet",
    "pick the part you need",
    "4 parts in this area",
    "close parts modal",
  ],
};

function dedupe(arr) {
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    const k = String(x).trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(String(x).trim());
  }
  return out;
}

for (const [key, phrases] of Object.entries(removeFrom)) {
  if (!Array.isArray(j[key])) continue;
  const rem = new Set(phrases.map((p) => p.toLowerCase()));
  j[key] = dedupe(j[key].filter((line) => !rem.has(String(line).trim().toLowerCase())));
}

writeFileSync(path, `${JSON.stringify(j, null, 2)}\n`);
console.log("cleaned sample-labels for", Object.keys(removeFrom).join(", "));

const designBoard = j["design-board"] || [];
const boardAdd = [
  "what part do you need?",
  "by area",
  "4 parts on file",
  "4 parts in this area",
  "navigate",
  "dismiss",
  "roomy",
  "4 on file",
  "2 on file",
  "which side?)",
];
const seenBoard = new Set(designBoard.map((l) => String(l).trim().toLowerCase()));
for (const line of boardAdd) {
  const k = line.toLowerCase();
  if (seenBoard.has(k)) continue;
  seenBoard.add(k);
  designBoard.push(line);
}
j["design-board"] = designBoard;
writeFileSync(path, `${JSON.stringify(j, null, 2)}\n`);
console.log("appended design-board composite labels");
