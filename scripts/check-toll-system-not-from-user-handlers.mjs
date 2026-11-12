#!/usr/bin/env node
/**
 * B7.3 edge guard: user-facing handlers must not call toll_system/toll schemas or
 * toll_v2_command via the service-role client.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FUNCTIONS = path.join(ROOT, 'supabase/functions');

const SKIP_NAME = (rel) =>
  rel.endsWith('.test.ts') ||
  rel.endsWith('.test.tsx') ||
  rel.endsWith('/index.ts') ||
  rel.includes('routes.generated');

function walk(dir, base = FUNCTIONS) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    const rel = path.relative(base, full).replace(/\\/g, '/');
    if (ent.isDirectory()) out.push(...walk(full, base));
    else if (/\.tsx?$/.test(ent.name)) out.push({ full, rel });
  }
  return out;
}

function lineHits(content, re) {
  const hits = [];
  const lines = content.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (re.test(line)) hits.push({ line: i + 1, text: line.trim() });
  });
  return hits;
}

let failed = false;

function fail(file, line, msg) {
  failed = true;
  console.error(`${file}:${line}: ${msg}`);
}

for (const { full, rel } of walk(FUNCTIONS)) {
  if (SKIP_NAME(rel)) continue;
  const content = fs.readFileSync(full, 'utf8');

  for (const h of lineHits(content, /\.schema\s*\(\s*['"]toll_system['"]/)) {
    fail(rel, h.line, 'must not use .schema("toll_system")');
  }
  for (const h of lineHits(content, /\.schema\s*\(\s*['"]toll['"]\s*\)/)) {
    fail(rel, h.line, 'must not use .schema("toll")');
  }
  for (const h of lineHits(content, /\.rpc\s*\(\s*['"]toll_system\./)) {
    fail(rel, h.line, 'must not rpc into toll_system');
  }

  const importsService = /getServiceClient/.test(content);
  const serviceCallsV2Command = /getServiceClient\s*\([^)]*\)[\s\S]{0,200}?\.rpc\s*\(\s*['"]toll_v2_command['"]/.test(
    content,
  );
  if (serviceCallsV2Command) {
    fail(rel, 1, 'getServiceClient must not call toll_v2_command');
  }
  if (importsService && /\.rpc\s*\(\s*['"]toll_v2_command['"]/.test(content) && serviceCallsV2Command) {
    fail(rel, 1, 'toll_v2_command must use user JWT client, not service client');
  }
}

if (failed) {
  console.error(
    'check-toll-system-not-from-user-handlers: failed (see toll_seal_before_pay: service client is for week_statements only; toll_v2_enabled uses user client)',
  );
  process.exit(1);
}

console.log('ok  check-toll-system-not-from-user-handlers');
