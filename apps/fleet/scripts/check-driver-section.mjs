/**
 * Soft guardrail for driver-section dead / unreachable JSX patterns.
 * Fails on `{false &&` (dead branches). Soft-warns on count of `false &&` without braces.
 *
 * Usage: node apps/fleet/scripts/check-driver-section.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../src/components/drivers');

const HARD_FAIL = /\{false\s*&&/;
const SOFT_WARN = /false\s*&&/g;

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, out);
    else if (/\.(tsx?|jsx?)$/.test(ent.name)) out.push(full);
  }
  return out;
}

const files = walk(ROOT);
const failures = [];
const warnings = [];

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const rel = path.relative(path.resolve(__dirname, '../..'), file).replace(/\\/g, '/');
  if (HARD_FAIL.test(text)) {
    failures.push(`${rel}: contains {false && (dead JSX branch)`);
  }
  const softHits = text.match(SOFT_WARN);
  if (softHits && softHits.length > 2) {
    warnings.push(`${rel}: ${softHits.length} "false &&" occurrences (soft warning)`);
  }
}

for (const w of warnings) console.warn(`WARN ${w}`);
if (failures.length) {
  console.error('Driver section check FAILED:');
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}

console.log(`check:drivers OK (${files.length} files scanned)`);
process.exit(0);
