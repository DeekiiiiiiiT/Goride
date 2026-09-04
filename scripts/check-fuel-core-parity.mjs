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
    rel: 'apps/fleet/src/services/settlementService.ts',
    mustMatch: /enterpriseFuelSyncIdempotencyKey[\s\S]*from\s+['"]@roam\/fuel-core['"]/,
    forbidden: /return `enterprise_fuel_sync:/,
  },
  {
    rel: 'apps/admin/src/services/settlementService.ts',
    mustMatch: /fuelSettlementEntryYmd[\s\S]*from\s+['"]@roam\/fuel-core['"]/,
    forbidden: /duplicated from FuelCalculationService/,
  },
  {
    rel: 'apps/driver/src/services/settlementService.ts',
    mustMatch: /fuelSettlementEntryYmd[\s\S]*from\s+['"]@roam\/fuel-core['"]/,
    forbidden: /duplicated from FuelCalculationService/,
  },
  // NEW-16: fleet coverage-split must re-export shared money math from fuel-core
  {
    rel: 'apps/fleet/src/utils/fuelCoverageSplit.ts',
    mustMatch: /from\s+['"]@roam\/fuel-core['"]/,
    forbidden:
      /function\s+getCategoryCoverageSplit\s*\(|function\s+splitAllCategoryCosts\s*\(|function\s+getCompanyCoveragePercent\s*\(/,
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

// Deno twin must re-export packages/fuel-core (Flawless Wave 1 / NEW-12)
const fuelCoreTwin = path.join(ROOT, 'supabase/functions/_shared/fuelCore.ts');
if (!fs.existsSync(fuelCoreTwin)) {
  failed = true;
  console.error('missing supabase/functions/_shared/fuelCore.ts Deno twin');
} else {
  const twinText = fs.readFileSync(fuelCoreTwin, 'utf8');
  if (!/from\s+['"]\.\.\/\.\.\/\.\.\/packages\/fuel-core\/src\/index\.ts['"]/.test(twinText)) {
    failed = true;
    console.error('supabase/functions/_shared/fuelCore.ts must re-export packages/fuel-core/src/index.ts');
  }
}

// Deno week engine must not reintroduce local coverage / ratio math
const weekEngine = path.join(ROOT, 'supabase/functions/_fleet-server/fuel_week_engine.ts');
if (fs.existsSync(weekEngine)) {
  const eng = fs.readFileSync(weekEngine, 'utf8');
  if (!/from\s+['"]\.\.\/_shared\/fuelCore\.ts['"]/.test(eng)) {
    failed = true;
    console.error('fuel_week_engine.ts must import from ../_shared/fuelCore.ts');
  }
  if (
    /function\s+companyCoveragePercent\s*\(/.test(eng) ||
    /function\s+driverRatio\s*\(/.test(eng) ||
    /function\s+companyCoveragePercentFromFuelRule\s*\(/.test(eng)
  ) {
    failed = true;
    console.error('fuel_week_engine.ts must not define local coverage/ratio math — use fuel-core');
  }
}

// NEW-13: client finalize must freeze through assembleWeekSnapshotsFromCalcInput
const finalizeAdapter = path.join(ROOT, 'apps/fleet/src/utils/fuelFinalizeWeekSnapAdapter.ts');
const finalizeService = path.join(ROOT, 'apps/fleet/src/services/fuelFinalizeService.ts');
if (!fs.existsSync(finalizeAdapter)) {
  failed = true;
  console.error('missing apps/fleet/src/utils/fuelFinalizeWeekSnapAdapter.ts (NEW-13)');
} else {
  const adapterText = fs.readFileSync(finalizeAdapter, 'utf8');
  if (!/assembleWeekSnapshotsFromCalcInput/.test(adapterText)) {
    failed = true;
    console.error('fuelFinalizeWeekSnapAdapter.ts must call assembleWeekSnapshotsFromCalcInput');
  }
  if (!/from\s+['"]@roam\/fuel-core['"]/.test(adapterText)) {
    failed = true;
    console.error('fuelFinalizeWeekSnapAdapter.ts must import from @roam/fuel-core');
  }
}
if (!fs.existsSync(finalizeService)) {
  failed = true;
  console.error('missing apps/fleet/src/services/fuelFinalizeService.ts');
} else {
  const finText = fs.readFileSync(finalizeService, 'utf8');
  if (!/freezeReportMoneyThroughAssembler/.test(finText)) {
    failed = true;
    console.error('fuelFinalizeService.ts must freeze via freezeReportMoneyThroughAssembler');
  }
  if (/FuelCalculationService\.getBlendedDriverShareRatio/.test(finText)) {
    failed = true;
    console.error('fuelFinalizeService.ts must not freeze shares via getBlendedDriverShareRatio');
  }
}

if (failed) {
  console.error('fuel-core parity check failed');
  process.exit(1);
}
console.log('fuel-core parity OK');
