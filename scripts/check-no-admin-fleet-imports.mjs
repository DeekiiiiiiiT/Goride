#!/usr/bin/env node
/**
 * Fail if apps/admin imports from @fleet or apps/fleet.
 * Shared screens live in @roam/platform-ops-ui / @roam/fuel-core.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ADMIN_SRC = path.join(ROOT, 'apps', 'admin');

const IMPORT_PATH_RE =
  /(?:(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\sfrom\s*)?|import\s*\(\s*)['"][^'"]*(?:@fleet(?:\/[^'"]*)?|apps\/fleet)[^'"]*['"]/g;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === 'dist') continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|mjs|jsx)$/.test(ent.name)) out.push(p);
  }
  return out;
}

const hits = [];
for (const abs of walk(ADMIN_SRC)) {
  const text = fs.readFileSync(abs, 'utf8');
  const code = text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  const matches = code.match(IMPORT_PATH_RE);
  if (!matches?.length) continue;
  hits.push({
    file: path.relative(ROOT, abs).replace(/\\/g, '/'),
    matches: [...new Set(matches.map((m) => m.replace(/\s+/g, ' ').trim()))],
  });
}

if (hits.length) {
  console.error(
    'apps/admin must not import @fleet or apps/fleet. Use @roam/platform-ops-ui / @roam/fuel-core:\n',
  );
  for (const h of hits) {
    console.error(`  ${h.file}`);
    for (const m of h.matches) console.error(`    ${m}`);
  }
  process.exit(1);
}

console.log('OK: no apps/admin imports from @fleet or apps/fleet');
process.exit(0);
