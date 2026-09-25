#!/usr/bin/env node
/**
 * Fails when toll shims regain forked implementations instead of re-exporting
 * @roam/toll-core (fleet-canonical). See packages/toll-core/README.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Paths that must be thin re-exports (no local function bodies for core APIs). */
const SHIMS = [
  {
    rel: 'apps/fleet/src/utils/tollCategoryHelper.ts',
    mustMatch: /from\s+['"]@roam\/toll-core['"]/,
    forbidden: /function\s+isTollCategory\s*\(/,
  },
  {
    rel: 'apps/admin/src/utils/tollCategoryHelper.ts',
    mustMatch: /from\s+['"]@roam\/toll-core['"]/,
    forbidden: /function\s+isTollCategory\s*\(/,
  },
  {
    rel: 'apps/driver/src/utils/tollCategoryHelper.ts',
    mustMatch: /from\s+['"]@roam\/toll-core['"]/,
    forbidden: /function\s+isTollCategory\s*\(/,
  },
  {
    rel: 'apps/fleet/src/utils/orphanTollClassifier.ts',
    mustMatch: /from\s+['"]@roam\/toll-core['"]/,
    forbidden: /function\s+classifyOrphanToll\s*\(/,
  },
  {
    rel: 'apps/admin/src/utils/orphanTollClassifier.ts',
    mustMatch: /from\s+['"]@roam\/toll-core['"]/,
    forbidden: /function\s+classifyOrphanToll\s*\(/,
  },
  {
    rel: 'supabase/functions/_fleet-server/orphanTollClassifier.ts',
    mustMatch: /packages\/toll-core\/src\/orphanTollClassifier/,
    forbidden: /function\s+classifyOrphanToll\s*\(/,
  },
  {
    rel: 'apps/fleet/src/utils/tollDate.ts',
    mustMatch: /from\s+['"]@roam\/toll-core['"]/,
    forbidden: /function\s+parseTollDate\s*\(/,
  },
  {
    rel: 'apps/fleet/src/utils/officialTollRate.ts',
    mustMatch: /from\s+['"]@roam\/toll-core['"]/,
    forbidden: /function\s+resolveOfficialTollRate\s*\(/,
  },
  {
    rel: 'apps/fleet/src/utils/unlinkedShortfallEligibility.ts',
    mustMatch: /packages\/toll-core\/src\/unlinkedShortfallEligibility/,
    forbidden: /function\s+isUnlinkedRefundActionableNow\s*\(/,
  },
];

/** Package surface that must stay exported (Phase 4b / TR-H1). */
const REQUIRED_PACKAGE_EXPORTS = ['tollSpend', 'tollPeriodReadiness'];

let failed = false;

for (const shim of SHIMS) {
  const abs = path.join(ROOT, shim.rel);
  if (!fs.existsSync(abs)) {
    failed = true;
    console.error(`missing shim: ${shim.rel}`);
    continue;
  }
  const text = fs.readFileSync(abs, 'utf8');
  const size = Buffer.byteLength(text, 'utf8');
  // Full implementations were typically 1–10KB; shims should stay small.
  if (size > 2500) {
    failed = true;
    console.error(`${shim.rel}: file too large (${size} bytes) — likely a full fork, not a re-export`);
  }
  if (!shim.mustMatch.test(text)) {
    failed = true;
    console.error(`${shim.rel}: must re-export from @roam/toll-core (or packages/toll-core for Deno)`);
  }
  if (shim.forbidden.test(text)) {
    failed = true;
    console.error(`${shim.rel}: contains forbidden local implementation body`);
  }
}

const pkgPath = path.join(ROOT, 'packages/toll-core/package.json');
const indexPath = path.join(ROOT, 'packages/toll-core/src/index.ts');
const readinessPath = path.join(ROOT, 'packages/toll-core/src/tollPeriodReadiness.ts');
const spendPath = path.join(ROOT, 'packages/toll-core/src/tollSpend.ts');

if (!fs.existsSync(pkgPath) || !fs.existsSync(indexPath)) {
  failed = true;
  console.error('missing packages/toll-core package.json or src/index.ts');
} else {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const exportsMap = pkg.exports || {};
  for (const name of REQUIRED_PACKAGE_EXPORTS) {
    if (!exportsMap[`./${name}`]) {
      failed = true;
      console.error(`packages/toll-core must export "./${name}" (subpath)`);
    }
  }
  const indexText = fs.readFileSync(indexPath, 'utf8');
  if (!/from\s+['"]\.\/tollSpend\.ts['"]/.test(indexText)) {
    failed = true;
    console.error('packages/toll-core/src/index.ts must re-export ./tollSpend.ts');
  }
  if (!/from\s+['"]\.\/tollPeriodReadiness\.ts['"]/.test(indexText)) {
    failed = true;
    console.error('packages/toll-core/src/index.ts must re-export ./tollPeriodReadiness.ts');
  }
}

if (!fs.existsSync(readinessPath) || !fs.existsSync(spendPath)) {
  failed = true;
  console.error('missing packages/toll-core/src/tollPeriodReadiness.ts or tollSpend.ts');
} else {
  const readinessText = fs.readFileSync(readinessPath, 'utf8');
  if (!/export function decideTollFinishAllowed/.test(readinessText)) {
    failed = true;
    console.error('tollPeriodReadiness.ts must export decideTollFinishAllowed (Finish gate)');
  }
  if (!/export function computeTollPeriodReadiness/.test(readinessText)) {
    failed = true;
    console.error('tollPeriodReadiness.ts must export computeTollPeriodReadiness');
  }
  const spendText = fs.readFileSync(spendPath, 'utf8');
  if (!/export function ledgerDebitSpendAmount/.test(spendText)) {
    failed = true;
    console.error('tollSpend.ts must export ledgerDebitSpendAmount');
  }
}

if (failed) {
  console.error('toll-core parity check failed — restore thin re-exports from @roam/toll-core.');
  process.exit(1);
}
console.log('toll-core parity OK (%d shims + package exports).', SHIMS.length);
