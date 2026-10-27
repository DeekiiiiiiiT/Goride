/**
 * Dominion Stitch fidelity check.
 * For each S-row in docs/stitch/dominion-redesign/README.md marked Ported (or Built):
 * - at least 80% of the Stitch screen's headings, column names, labels and buttons appear in the React file;
 * - the React file no longer imports the old components/ui kit.
 * D-rows (Roam Plug screens) and S1, S7, S8 are final and skipped.
 * Run: node scripts/stitch-fidelity.mjs [--report]
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repo = join(import.meta.dirname, '..');
const dir = join(repo, 'docs', 'stitch', 'dominion-redesign');
const readme = readFileSync(join(dir, 'README.md'), 'utf8');
const report = process.argv.includes('--report');
const SKIP = new Set(['S1', 'S7', 'S8']);
const MIN = 80;
const OLD_KIT = /from ['"](@\/components\/ui|(\.\.?\/)+ui)\//;

const strip = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
let failed = false;

for (const row of readme.split('\n').filter((l) => /^\| S\d/.test(l))) {
  const cells = row.split('|').map((c) => c.trim().replace(/^`|`$/g, ''));
  const [num, , , html, , react, status = ''] = cells.slice(1);
  if (SKIP.has(num) || !html || html === '—' || !react || react === '—') continue;
  const checked = /^(Ported|Built)/.test(status);
  const page = readFileSync(join(dir, html), 'utf8').replace(/<(script|style)[\s\S]*?<\/\1>/g, '');
  const body = (page.match(/<main[\s\S]*<\/main>/) || [page])[0];
  const labels = new Set();
  for (const m of body.matchAll(/<(h1|h2|h3|h4|th|button|label)[^>]*>([\s\S]*?)<\/\1>/g)) {
    const t = strip(m[2]).replace(/^[a-z_]+ /, '').toLowerCase(); // drop icon ligature names
    if (t.length >= 4 && t.length <= 40 && /[a-z]/.test(t)) labels.add(t);
  }
  const src = readFileSync(join(repo, react), 'utf8');
  const lower = src.toLowerCase();
  const hit = [...labels].filter((l) => lower.includes(l)).length;
  const pct = labels.size ? Math.round((100 * hit) / labels.size) : 100;
  const oldKit = OLD_KIT.test(src);
  const bad = pct < MIN || oldKit;
  if (report || (checked && bad)) {
    console.log(`${bad ? 'FAIL' : 'ok  '} ${num} ${pct}% labels${oldKit ? ', old ui kit' : ''} — ${react}`);
  }
  if (checked && bad) failed = true;
}

if (failed) process.exit(1);
console.log('OK — Dominion Stitch fidelity');
