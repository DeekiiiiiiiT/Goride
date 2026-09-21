#!/usr/bin/env node
/**
 * Guard: fuel UI must not derive service line from vehicle/driver records.
 * Server owns T0–T5 attribution (FUEL_SERVICE_LINE_SPLIT_AUDIT.md §3.3).
 *
 * Run: node scripts/check-no-client-service-line-derivation.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const FUEL_UI = join(ROOT, 'apps/fleet/src/components/fuel');

const BANNED = [
  {
    re: /serviceLines?\s*\?\.\s*(includes|find|filter|some|every|length)/i,
    why: 'derives line from vehicle/driver serviceLines array',
  },
  {
    re: /service_lines\s*\?\.\s*(includes|find|filter|some|every|length)/i,
    why: 'derives line from service_lines array',
  },
  {
    re: /resolveFuelEntryServiceLine|ensureFuelEntryServiceLine|ensureCostRowServiceLine/,
    why: 'imports server resolver into client fuel UI',
  },
  {
    re: /inferTripServiceLine|stampServiceLineFromTripLink/,
    why: 'imports server trip stamp into client fuel UI',
  },
];

/** Allowed: reading entry.serviceLine / serviceLineSource already stamped by server. */
function isAllowedRead(line) {
  return (
    /entry\.serviceLine|row\.serviceLine|r\.serviceLine|e\.serviceLine|fuel\.serviceLine|serviceLineSource|service_line_source/.test(
      line,
    ) || /filter.*serviceLine\s*===|serviceLine\s*===\s*['"]rideshare|serviceLine\s*===\s*['"]rush_delivery/.test(
      line,
    )
  );
}

function walk(dir, out = []) {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|jsx)$/.test(name) && !name.includes('.test.')) out.push(p);
  }
  return out;
}

const files = walk(FUEL_UI);
const violations = [];

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) continue;
    for (const ban of BANNED) {
      if (!ban.re.test(line)) continue;
      if (isAllowedRead(line)) continue;
      violations.push({
        file: relative(ROOT, file).replace(/\\/g, '/'),
        line: i + 1,
        why: ban.why,
        text: line.trim().slice(0, 140),
      });
    }
  }
}

if (violations.length) {
  console.error('Client fuel UI must not derive service line:\n');
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line} — ${v.why}\n    ${v.text}`);
  }
  process.exit(1);
}

console.log(`check-no-client-service-line-derivation: OK (${files.length} files)`);
