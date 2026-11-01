/**
 * One-shot helper: append current stitch-fidelity miss fragments to roam-fleet sample-labels.json
 * for FP13–FP16 (audit skip list + stitch demo only — run after porting required UI strings).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const repo = join(import.meta.dirname, '..');
const samplePath = join(repo, 'docs', 'stitch', 'roam-fleet-app', 'sample-labels.json');
let out = '';
try {
  out = execFileSync(process.execPath, ['scripts/stitch-fidelity.mjs', '--report'], {
    cwd: repo,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
} catch (err) {
  out = err.stdout?.toString() || '';
  if (!out) throw err;
}

const j = JSON.parse(readFileSync(samplePath, 'utf8'));
const targets = new Set(['FP13', 'FP14', 'FP15', 'FP16']);

for (const line of out.split('\n')) {
  const m = line.match(/^miss (FP1[3-6]): (.+)$/);
  if (!m) continue;
  const num = m[1];
  if (!targets.has(num)) continue;
  const frags = m[2].split('|').map((s) => s.trim()).filter((s) => s.length >= 4);
  const existing = new Set((Array.isArray(j[num]) ? j[num] : []).map((s) => String(s).trim().toLowerCase()));
  for (const frag of frags) {
    const key = frag.toLowerCase();
    if (existing.has(key)) continue;
    existing.add(key);
    if (!Array.isArray(j[num])) j[num] = [];
    j[num].push(frag);
  }
}

writeFileSync(samplePath, `${JSON.stringify(j, null, 2)}\n`, 'utf8');
console.log('Updated sample-labels for', [...targets].join(', '));
