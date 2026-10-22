/**
 * Page reads must not calculate fuel, toll, earnings, or settlement.
 * Opening a week, finishing a step, and the close preview are reads.
 * A dynamic import() is opened and scanned too — a string check on the
 * route file alone misses `await import("./recon_worker.ts")`.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const checks = [
  {
    file: 'supabase/functions/_fleet-server/recon_routes.ts',
    forbidden: [
      'buildFuelPeriodSnapshots',
      'compareDriverWeekStatementsToEngines',
      'computePeriodSettlement',
      'rebuildDriverFinancialPeriod',
      'rebuildOneDriverPeriod',
      'prepareFuelWeekReports',
      'sumBusinessWeekPnlMajor',
      'previewWeekClose',
    ],
  },
  {
    file: 'apps/fleet/src/components/fuel/reconciliation/FuelPeriodWizard.tsx',
    forbidden: ['computeFuelWeek'],
  },
];

const preview = readFileSync('supabase/functions/_fleet-server/week_close_controller.tsx', 'utf8');
if (!preview.includes('skipEngineProbe: true')) {
  console.error('Close preview must skip the fuel, toll, and earnings engines.');
  process.exit(1);
}
if (preview.includes('prepareWeekClose(')) {
  console.error('Refresh must not calculate the week inside the page request.');
  process.exit(1);
}

function resolveImport(fromFile, spec) {
  const base = path.normalize(path.join(path.dirname(fromFile), spec));
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function dynamicImportSpecs(source) {
  const specs = [];
  const re = /import\(\s*['"](\.[^'"]+)['"]\s*\)/g;
  let match;
  while ((match = re.exec(source)) !== null) specs.push(match[1]);
  return specs;
}

function scanFile(file, forbidden, seen, failed) {
  const key = path.normalize(file);
  if (seen.has(key)) return;
  seen.add(key);
  const source = readFileSync(file, 'utf8');
  for (const name of forbidden) {
    if (source.includes(name)) {
      console.error(`${file} still references ${name}`);
      failed.current = true;
    }
  }
  for (const spec of dynamicImportSpecs(source)) {
    const next = resolveImport(file, spec);
    if (!next) {
      console.error(`${file} dynamic import ${spec} could not be opened`);
      failed.current = true;
      continue;
    }
    scanFile(next, forbidden, seen, failed);
  }
}

const failed = { current: false };
for (const check of checks) {
  scanFile(check.file, check.forbidden, new Set(), failed);
}

if (failed.current) process.exit(1);
console.log('edge reads do not run week engines');
