/**
 * CI guard: driver app must not call legacy joinFleetByFleetId.
 * Run: node scripts/check-no-join-fleet-client.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const DRIVER_SRC = join(ROOT, 'apps/driver/src');
const BANNED = ['joinFleetByFleetId', 'join-fleet'];

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, files);
    else if (/\.(ts|tsx|js|jsx)$/.test(name)) files.push(p);
  }
  return files;
}

const hits = [];
for (const file of walk(DRIVER_SRC)) {
  const text = readFileSync(file, 'utf8');
  for (const term of BANNED) {
    if (text.includes(term) && !text.includes('removed')) {
      hits.push({ file, term });
    }
  }
}

if (hits.length) {
  console.error('Legacy fleet join references found in driver app:');
  for (const h of hits) console.error(`  ${h.term} in ${h.file}`);
  process.exit(1);
}

console.log('OK — no legacy joinFleetByFleetId usage in driver app');
