import fs from 'node:fs';
import path from 'node:path';

const stagingPath = process.argv[2];
if (!stagingPath) {
  console.error('Usage: node write-stitch-html-from-json.mjs <staging.json>');
  process.exit(1);
}

const entries = JSON.parse(fs.readFileSync(stagingPath, 'utf8'));
const outDir =
  'c:/Users/deeki/OneDrive/Documents/App and Web design/Roam/Goride/docs/stitch/roam-plug/html';

for (const { filename, html } of entries) {
  if (!html || typeof html !== 'string') {
    console.error(`Missing html for ${filename}`);
    process.exit(1);
  }
  const target = path.join(outDir, filename);
  fs.writeFileSync(target, html, 'utf8');
  console.log(`Wrote ${filename} (${html.length} bytes)`);
}
