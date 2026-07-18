const fs = require("fs");
const text = fs.readFileSync("docs/edge-function-audit.md", "utf8");
const marker = "## Chunk E — Rides: fare";
const idx = text.indexOf(marker);
let part1 = text.slice(0, idx).trimEnd();
let part2 =
  "# Edge Function Audit — Roam / Fleet (continued)\n\n" + text.slice(idx);
const reps = [
  ["### 🚨 Critical", "### Critical"],
  ["### ⚠️ High priority", "### High priority"],
  [
    "### 🧹 Cleanup & redundancy — the duplicate files",
    "### Cleanup & redundancy — the duplicate files",
  ],
  ["### 🧹 Cleanup & redundancy", "### Cleanup & redundancy"],
  ["### ✅ What's actually solid", "### What's actually solid"],
];
for (const [a, b] of reps) {
  part1 = part1.split(a).join(b);
  part2 = part2.split(a).join(b);
}
fs.mkdirSync(".cursor/notion-staging", { recursive: true });
fs.writeFileSync(".cursor/notion-staging/audit-part1.md", part1);
fs.writeFileSync(".cursor/notion-staging/audit-part2.md", part2);
fs.writeFileSync(
  ".cursor/notion-staging/redteam.md",
  fs.readFileSync("docs/edge-audit-redteam.md", "utf8"),
);
fs.writeFileSync(
  ".cursor/notion-staging/rollout.md",
  fs.readFileSync("docs/fleet-data-isolation-rollout.md", "utf8"),
);
console.log(part1.length, part2.length);
