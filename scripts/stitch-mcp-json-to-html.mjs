import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [mcpJsonPath, outHtmlName] = process.argv.slice(2);
if (!mcpJsonPath || !outHtmlName) {
  console.error("Usage: node stitch-mcp-json-to-html.mjs <mcp.json> <out.html>");
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(mcpJsonPath, "utf8"));
if (!payload.html?.trim()) {
  console.error("Missing html in MCP JSON");
  process.exit(1);
}

const out = path.join(root, "docs/stitch/dominion-redesign/html", outHtmlName);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, payload.html, "utf8");
console.log(`Wrote ${out} (${payload.html.length} bytes)`);
