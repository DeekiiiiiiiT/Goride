/**
 * Regenerate docs/stitch/roam-fleet-app/sample-labels.json "live-data" from IN Stitch HTML.
 * Run: node scripts/gen-inventory-live-data-samples.mjs
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const repo = join(import.meta.dirname, '..');
const fleetDir = join(repo, 'docs', 'stitch', 'roam-fleet-app');
const driverDir = join(repo, 'docs', 'stitch', 'roam-driver-app');
const samplePath = join(fleetDir, 'sample-labels.json');
const driverSamplePath = join(driverDir, 'sample-labels.json');

function strip(s) {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function phrasesFromHtml(htmlPath) {
  const out = new Set();
  if (!existsSync(htmlPath)) return out;
  const page = readFileSync(htmlPath, 'utf8').replace(/<(script|style)[\s\S]*?<\/\1>/gi, '');
  const main = (page.match(/<main[\s\S]*<\/main>/i) || [page])[0];
  for (const m of main.matchAll(/>([^<]{4,140})</g)) {
    const t = strip(m[1]).toLowerCase();
    if (t.length >= 4 && /[a-z]/.test(t) && !/^[a-z_]+$/.test(t)) out.add(t);
  }
  for (const m of page.matchAll(/<(dialog|aside)[^>]*>[\s\S]*?<\/\1>/gi)) {
    for (const t of m[0].matchAll(/>([^<]{4,140})</g)) {
      const s = strip(t[1]).toLowerCase();
      if (s.length >= 4 && /[a-z]/.test(s)) out.add(s);
    }
  }
  return out;
}

const fleetSamples = JSON.parse(readFileSync(samplePath, 'utf8'));
const live = new Set(fleetSamples['live-data'] ?? []);

const readme = readFileSync(join(fleetDir, 'README.md'), 'utf8');
for (const row of readme.split('\n').filter((l) => /^\| IN\d/.test(l))) {
  const cells = row.split('|').map((c) => c.trim().replace(/^`|`$/g, ''));
  const folder = cells[3];
  const htmlPath = join(fleetDir, 'inventory', folder, 'code.html');
  for (const p of phrasesFromHtml(htmlPath)) live.add(p);
}

fleetSamples['live-data'] = [...live].sort();
writeFileSync(samplePath, `${JSON.stringify(fleetSamples, null, 2)}\n`);

const driverSamples = JSON.parse(readFileSync(driverSamplePath, 'utf8'));
const dreadme = readFileSync(join(driverDir, 'README.md'), 'utf8');
for (const row of dreadme.split('\n').filter((l) => /^\| DK\d/.test(l))) {
  const cells = row.split('|').map((c) => c.trim().replace(/^`|`$/g, ''));
  const num = cells[1];
  const folder = cells[3];
  const set = new Set(driverSamples[num] ?? []);
  for (const p of phrasesFromHtml(join(driverDir, 'car-kit', folder, 'code.html'))) set.add(p);
  driverSamples[num] = [...set].sort();
}
writeFileSync(driverSamplePath, `${JSON.stringify(driverSamples, null, 2)}\n`);
console.log(`live-data: ${fleetSamples['live-data'].length} phrases`);
