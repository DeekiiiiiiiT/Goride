#!/usr/bin/env node
import { readFileSync } from 'node:fs';
const raw = readFileSync('scripts/mismatch-versions.json', 'utf8').replace(/^\uFEFF/, '');
const v = JSON.parse(raw);
for (let i = 0; i < v.length; i += 25) {
  const batch = v.slice(i, i + 25).map((x) => `'${x}'`).join(',');
  console.log(`-- batch ${i / 25}\n${batch}\n`);
}
