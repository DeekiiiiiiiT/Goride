#!/usr/bin/env node
/**
 * Decode MCP execute_sql base64 export into supabase/migrations inventory files.
 * Usage: node scripts/decode-prod-b64-export.mjs <path-to-mcp-output.txt>
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: node scripts/decode-prod-b64-export.mjs <mcp-output.txt>');
  process.exit(1);
}

const raw = readFileSync(inputPath, 'utf8');
let rows;
try {
  const outer = JSON.parse(raw.trim());
  const inner = outer.result ?? outer;
  const match = String(inner).match(/\[\s*\{\s*"version"/);
  if (!match) throw new Error('no array');
  const start = String(inner).indexOf('[{"version"');
  const end = String(inner).lastIndexOf('}]');
  rows = JSON.parse(String(inner).slice(start, end + 2));
} catch {
  const marker = raw.indexOf('[{"version"');
  const end = raw.lastIndexOf('}]');
  if (marker < 0 || end < 0) {
    console.error('Could not find JSON array in input');
    process.exit(1);
  }
  rows = JSON.parse(raw.slice(marker, end + 2));
}

const root = join(dirname(import.meta.dirname));
const tmp = join(root, 'scripts', 'tmp-migrations');
mkdirSync(tmp, { recursive: true });

for (const row of rows) {
  const b64 = row.b64.replace(/\s+/g, '');
  const body = Buffer.from(b64, 'base64').toString('utf8');
  writeFileSync(join(tmp, `${row.version}.sql`), body, 'utf8');
  console.log(`${row.version}: ${Buffer.byteLength(body, 'utf8')} bytes`);
}
