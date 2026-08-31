#!/usr/bin/env node
/**
 * Fails when fuel shims regain forked implementations instead of re-exporting
 * @roam/fuel-core / fleet-canonical. See packages/fuel-core/README.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SHIMS = [
  {
    rel: 'apps/fleet/src/utils/fuelBrainFlags.ts',
    mustMatch: /from\s+['"]@roam\/fuel-core['"]/,
    forbidden: /export const FLEET_USE_FUEL_BRAIN =\s*\n?\s*import\.meta\.env/,
  },
  {
    rel: 'apps/admin/src/services/fuelCalculationService.ts',
    mustMatch: /from\s+['"]@fleet\/services\/fuelCalculationService['"]/,
    forbidden: /FALLBACK_PRICE_PER_LITER\s*=\s*1\.50/,
  },
  {
    rel: 'apps/driver/src/services/fuelCalculationService.ts',
    mustMatch: /from\s+['"]@fleet\/services\/fuelCalculationService['"]/,
    forbidden: /FALLBACK_PRICE_PER_LITER\s*=\s*1\.50/,
  },
  {
    rel: 'apps/admin/src/utils/fuelCycleEngine.ts',
    mustMatch: /from\s+['"]@fleet\/utils\/fuelCycleEngine['"]/,
    forbidden: /function calculateFuelCycles\s*\(/,
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
  if (size > 4000 && shim.rel.includes('fuelCalculationService')) {
    failed = true;
    console.error(`${shim.rel}: file too large (${size} bytes) — likely a full fork, not a re-export`);
  }
  if (size > 2000 && shim.rel.includes('fuelCycleEngine')) {
    failed = true;
    console.error(`${shim.rel}: file too large (${size} bytes) — likely a full fork, not a re-export`);
  }
  if (!shim.mustMatch.test(text)) {
    failed = true;
    console.error(`${shim.rel}: must re-export from @roam/fuel-core / @fleet canonical`);
  }
  if (shim.forbidden.test(text)) {
    failed = true;
    console.error(`${shim.rel}: contains forbidden local implementation body`);
  }
}

// Hard ban: no 1.50 price fallback anywhere in fuel calc services
for (const rel of [
  'apps/fleet/src/services/fuelCalculationService.ts',
  'apps/admin/src/services/fuelCalculationService.ts',
  'apps/driver/src/services/fuelCalculationService.ts',
  'packages/fuel-core/src',
]) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) continue;
  const walk = (p) => {
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      for (const name of fs.readdirSync(p)) walk(path.join(p, name));
      return;
    }
    if (!/\.(ts|tsx|js)$/.test(p)) return;
    const text = fs.readFileSync(p, 'utf8');
    if (/FALLBACK_PRICE_PER_LITER\s*=\s*1\.50/.test(text) || /actualPricePerLiter\s*=\s*1\.50/.test(text)) {
      failed = true;
      console.error(`${path.relative(ROOT, p)}: forbidden USD-era 1.50 price fallback`);
    }
  };
  walk(abs);
}

// Dead packages/types fuel copy must stay deleted
const staleTypes = path.join(ROOT, 'packages/types/src/fuel.ts');
if (fs.existsSync(staleTypes)) {
  failed = true;
  console.error('packages/types/src/fuel.ts must remain deleted — use app-local or @roam/fuel-core types');
}

if (failed) {
  console.error('fuel-core parity check failed');
  process.exit(1);
}
console.log('fuel-core parity OK');
