import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [screenId, filename, mcpJsonPath] = process.argv.slice(2);
if (!screenId || !filename || !mcpJsonPath) {
  console.error(
    "Usage: node write-dominion-stitch-html.mjs <screenId> <filename> <mcp-response.json>",
  );
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(mcpJsonPath, "utf8"));
const html = payload.html;
if (!html?.trim()) {
  console.error("Missing html in MCP JSON");
  process.exit(1);
}

const outDir = path.join(root, "docs/stitch/dominion-redesign/html");
const cacheDir = path.join(root, "docs/stitch/dominion-redesign/.cache");
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(cacheDir, { recursive: true });

fs.writeFileSync(path.join(outDir, filename), html, "utf8");
fs.writeFileSync(
  path.join(cacheDir, `${screenId}.json`),
  JSON.stringify({ filename, htmlLength: html.length }),
  "utf8",
);
console.log(`OK ${filename} (${html.length} bytes) → docs/stitch/dominion-redesign/html/`);
