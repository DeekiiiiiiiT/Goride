import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "docs/stitch/dominion-redesign/html");
const agentTools = path.join(
  process.env.USERPROFILE || "",
  ".cursor/projects/c-Users-deeki-OneDrive-Documents-App-and-Web-design-Roam-Goride/agent-tools",
);

const pairs = [
  ["aab110819721426fab7839674b931f9e", "P1-price-engine-overview.html", "d342bf02-7382-45a4-bc9c-61ae107b0317.txt"],
  ["c48abb51fac94d12855c1a228d093ef9", "P2-price-engine-review-queue.html", "0e2eb24d-517d-4f9c-ab1f-c782bd30759e.txt"],
  ["7517e96d14c9411ba89ed96f0528fa5b", "P3-price-engine-review-split.html", "287763b0-d4ed-491e-9bca-83d532ebdadb.txt"],
  ["0e5ad3b5a7bc4367a7bac6052e218e62", "P4-price-engine-published.html", "7bc53578-a70a-40aa-9f1e-102b53bb80c9.txt"],
  ["609d9c97497c4497b653da65f6fb595f", "P5-price-engine-station-drawer.html", "523462c4-33ce-4cbd-96ab-eb43133a38c0.txt"],
  ["429241b1ca5945f68cd597d5c1923b7c", "P6-price-engine-reporters.html", "776fad49-e74e-4a56-80f7-90d9dfdc2382.txt"],
  ["fd5c351e3fba488d94de12155b13762e", "P7-price-engine-settings.html", "p7-fd5c351e3fba488d94de12155b13762e.txt"],
];

fs.mkdirSync(outDir, { recursive: true });
for (const [id, filename, jsonFile] of pairs) {
  const payload = JSON.parse(fs.readFileSync(path.join(agentTools, jsonFile), "utf8"));
  if (!payload.html) throw new Error(`missing html in ${jsonFile}`);
  fs.writeFileSync(path.join(outDir, filename), payload.html, "utf8");
  console.log("OK", filename, id);
}
