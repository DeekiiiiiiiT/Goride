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
];

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

if (failed) {
  console.error('toll-core parity check failed — restore thin re-exports from @roam/toll-core.');
  process.exit(1);
}
console.log('toll-core parity OK (%d shims).', SHIMS.length);
