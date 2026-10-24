import fs from 'node:fs';

const [jsonPath, outPath] = process.argv.slice(2);
if (!jsonPath || !outPath) {
  console.error('Usage: node decode-stitch-json-html.mjs <response.json> <out.html>');
  process.exit(1);
}
const { html } = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
if (!html?.trim()) {
  console.error('Missing html field');
  process.exit(1);
}
fs.mkdirSync(outPath.replace(/[^/\\]+$/, ''), { recursive: true });
fs.writeFileSync(outPath, html, 'utf8');
console.log(`Wrote ${outPath} (${html.length}b)`);
