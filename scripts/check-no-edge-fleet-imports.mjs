#!/usr/bin/env node
/**
 * R-11: fail if supabase/functions imports from apps/fleet (edge must use packages/*).
 * Comments mentioning apps/fleet are allowed; only import / dynamic-import / export-from paths count.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EDGE_ROOT = path.join(ROOT, 'supabase', 'functions');

/**
 * Catches:
 *   import "...apps/fleet..."
 *   import x from "...apps/fleet..."
 *   export * from "...apps/fleet..."
 *   import("...apps/fleet...")
 */
const IMPORT_PATH_RE =
  /(?:(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\sfrom\s*)?|import\s*\(\s*)['"][^'"]*apps\/fleet[^'"]*['"]/g;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|mjs|jsx)$/.test(ent.name)) out.push(p);
  }
  return out;
}

const hits = [];
for (const abs of walk(EDGE_ROOT)) {
  const text = fs.readFileSync(abs, 'utf8');
  // Strip block + line comments so docs like "see apps/fleet/..." do not fail CI.
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
  console.error('Edge functions must not import from apps/fleet. Use packages/* instead:\n');
  for (const h of hits) {
    console.error(`  ${h.file}`);
    for (const m of h.matches) console.error(`    ${m}`);
  }
  process.exit(1);
}

console.log('OK: no supabase/functions imports from apps/fleet');
process.exit(0);
