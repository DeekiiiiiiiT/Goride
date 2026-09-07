/**
 * Soft guardrail for driver-section dead / unreachable JSX patterns and money formatting.
 * Fails on `{false &&` (dead branches) and hand-rolled `` `$${ `` money templates.
 * Hard-fails when DriverDetail.tsx exceeds the 400-line shell budget.
 * Soft-warns on count of `false &&` without braces and leftover
 * "Restoring rich performance dashboard" copy.
 * Also runs the driver-spine typecheck (R4-2) so missing status-map keys fail CI.
 *
 * Usage: node apps/fleet/scripts/check-driver-section.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../src/components/drivers');
const REPO_ROOT = path.resolve(__dirname, '../../..');

const HARD_FAIL = /\{false\s*&&/;
const SOFT_WARN = /false\s*&&/g;
/** Hand-rolled USD-looking money: `$` immediately followed by `${` inside a template literal. */
const MONEY_TEMPLATE = /`[^`]*\$\$\{/;
const RICH_DASHBOARD_COPY = /Restoring rich performance dashboard/;
const DRIVER_DETAIL = path.join(ROOT, 'DriverDetail.tsx');
const DRIVER_DETAIL_LINE_MAX = 400;

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
  if (MONEY_TEMPLATE.test(text)) {
    const hits = text.match(new RegExp(MONEY_TEMPLATE.source, 'g')) || [];
    failures.push(
      `${rel}: ${hits.length} hand-rolled \`$\${ money template(s) — use formatJMD()`,
    );
  }
  if (RICH_DASHBOARD_COPY.test(text)) {
    warnings.push(
      `${rel}: leftover "Restoring rich performance dashboard" copy — replace with a plain loading state`,
    );
  }
}

if (fs.existsSync(DRIVER_DETAIL)) {
  const lines = fs.readFileSync(DRIVER_DETAIL, 'utf8').split(/\r?\n/).length;
  if (lines > DRIVER_DETAIL_LINE_MAX) {
    failures.push(
      `src/components/drivers/DriverDetail.tsx: ${lines} lines (> ${DRIVER_DETAIL_LINE_MAX} shell budget)`,
    );
  }
}

// R5-1 / R6: Earnings History must page via useInfiniteQuery — no direct API load-more.
const EARNINGS_HISTORY = path.join(ROOT, 'DriverEarningsHistory.tsx');
if (fs.existsSync(EARNINGS_HISTORY)) {
  const eh = fs.readFileSync(EARNINGS_HISTORY, 'utf8');
  if (/from\s+['"].*services\/api['"]/.test(eh) || /\bapi\.getLedgerEarningsHistory\b/.test(eh)) {
    failures.push(
      'src/components/drivers/DriverEarningsHistory.tsx: must not import api or call getLedgerEarningsHistory — use useDriverEarningsHistory',
    );
  }
}

for (const w of warnings) console.warn(`WARN ${w}`);
if (failures.length) {
  console.error('Driver section check FAILED:');
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}

// Phase F: roster + operational-periods SQL migrations must exist in repo.
const migRoot = path.resolve(__dirname, '../../../supabase/migrations');
const requiredMigs = [
  'fleet_driver_roster_sql_aggregates',
  'driver_operational_periods',
];
if (fs.existsSync(migRoot)) {
  const migNames = fs.readdirSync(migRoot).join('\n');
  for (const needle of requiredMigs) {
    if (!migNames.includes(needle)) {
      console.error(`Driver section check FAILED: missing migration matching ${needle}`);
      process.exit(1);
    }
  }
}

// R4-2: driver-spine tsc must stay clean (would have caught Awaiting Tolls crash).
const tscScript = path.join(REPO_ROOT, 'scripts', 'typecheck-fleet-drivers.mjs');
const tsc = spawnSync(process.execPath, [tscScript], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
});
if (tsc.stdout) process.stdout.write(tsc.stdout);
if (tsc.stderr) process.stderr.write(tsc.stderr);
if (tsc.status !== 0) {
  process.exit(tsc.status ?? 1);
}

console.log(`check:drivers OK (${files.length} files scanned)`);
process.exit(0);
