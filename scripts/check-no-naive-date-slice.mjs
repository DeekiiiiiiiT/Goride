#!/usr/bin/env node
/**
 * One-week rule guardrail (ADR 0007 / Flawless Weekly Close Phase 2).
 *
 * Naively slicing a UTC timestamp to a calendar day
 *   `row.createdAt.slice(0, 10)`  /  `row.postingAt.split('T')[0]`
 * lands on the WRONG America/Jamaica day for anything near midnight, which then
 * buckets the money into the wrong Mon–Sun settlement week. Every timestamp must
 * go through a tz-explicit helper instead (fleetCalendarDay / periodKeyFor /
 * fuelSettlementEntryYmd / tollEventDate / parseTollDate).
 *
 * This check flags `.slice(0, 10)` / `.split('T')[0]` applied DIRECTLY to a
 * known full-timestamp field (createdAt, postingAt, effectiveAt, …). Bare-ymd
 * identifiers (already yyyy-MM-dd anchors/day keys) are inherently safe and are
 * not matched. Pre-existing, out-of-scope hits are allowlisted below; add an
 * inline `// naive-date-ok:` comment (with a reason) to allowlist a new line.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SCAN_DIRS = [
  'packages/finance-core/src',
  'packages/fuel-core/src',
  'packages/toll-core/src',
  'supabase/functions/_fleet-server',
];

// Full ISO timestamp fields — slicing these to a day is always tz-unsafe.
const TIMESTAMP_FIELDS = [
  'createdAt',
  'created_at',
  'updatedAt',
  'updated_at',
  'postingAt',
  'posting_at',
  'postedAt',
  'posted_at',
  'effectiveAt',
  'effective_at',
  'dropoffTime',
  'pickupTime',
  'timestamp',
];

const FIELD_ALT = TIMESTAMP_FIELDS.map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
const SLICE_ALT = String.raw`\.slice\(\s*0\s*,\s*10\s*\)|\.split\(\s*['"]T['"]\s*\)\s*\[\s*0\s*\]`;
// e.g. `foo.createdAt?.slice(0, 10)` or `x.postingAt.split('T')[0]`
const VIOLATION_RE = new RegExp(
  String.raw`\b(?:${FIELD_ALT})\b\s*\??\.?\s*(?:${SLICE_ALT})`,
);

/**
 * Pre-existing hits that predate the guardrail. Each is a { file, needle }.
 * These are out of the Flawless Weekly Close scope; tightening them is tracked
 * separately. New naive slices are NOT allowed — annotate with `// naive-date-ok:`.
 */
const ALLOWLIST = [
  { file: 'packages/finance-core/src/payoutCashC1.ts', needle: "String(e.effectiveAt || '').slice(0, 10)" },
  { file: 'supabase/functions/_fleet-server/toll_controller.tsx', needle: 'tx.createdAt?.split("T")[0]' },
  { file: 'supabase/functions/_fleet-server/expense_hub_routes.ts', needle: 'tx.date || tx.createdAt' },
  // Diagnostic per-day cache key for rate-limit stats — not a settlement bucket.
  { file: 'supabase/functions/_fleet-server/org_scope.ts', needle: 'filter_stats:${stats.timestamp' },
];

function walk(dir, out = []) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx|js|mjs|jsx)$/.test(ent.name) && !/\.test\.(ts|tsx|js)$/.test(ent.name)) out.push(rel);
  }
  return out;
}

function isAllowlisted(relFile, line) {
  const norm = relFile.replace(/\\/g, '/');
  return ALLOWLIST.some((a) => a.file === norm && line.includes(a.needle));
}

const violations = [];
for (const dir of SCAN_DIRS) {
  for (const rel of walk(dir)) {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!VIOLATION_RE.test(line)) continue;
      if (line.includes('naive-date-ok:')) continue;
      if (isAllowlisted(rel, line)) continue;
      violations.push({ file: rel.replace(/\\/g, '/'), line: i + 1, text: line.trim() });
    }
  }
}

if (violations.length) {
  console.error('Naive timezone-unsafe date slicing found (one-week rule / ADR 0007):\n');
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    ${v.text}`);
  }
  console.error(
    '\nUse a tz-explicit helper (fleetCalendarDay / periodKeyFor / tollEventDate /' +
      '\nfuelSettlementEntryYmd / parseTollDate) instead of slicing a UTC timestamp.' +
      '\nIf the value is provably a bare yyyy-MM-dd, annotate the line with' +
      "\n`// naive-date-ok: <reason>`.",
  );
  process.exit(1);
}

console.log('OK: no naive timezone-unsafe date slicing on timestamp fields');
process.exit(0);
