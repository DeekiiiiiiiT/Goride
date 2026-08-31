/**
 * Fail CI only on money-spine TypeScript errors (audit M3 / K3 class).
 * Full-app `tsc` still has a large UI/package backlog; this gates the fuel money path.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = process.argv[2]; // 'fleet' | 'admin'
if (app !== 'fleet' && app !== 'admin') {
  console.error('Usage: node scripts/typecheck-fuel-money.mjs <fleet|admin>');
  process.exit(2);
}

const filter =
  app === 'fleet'
    ? /(?:^|[/\\])(?:src[/\\])?(?:services[/\\]fuelCalculationService|services[/\\]fuelBrainClient|services[/\\]fuelFinalizeService|utils[/\\]fuelBrainFlags|utils[/\\]buildFuelWeekReportsForFinalize|utils[/\\]fuelAnalyticsAggregates|utils[/\\]payoutDraftFuel|utils[/\\]fuelCycleEngine|utils[/\\]personalAllowance|utils[/\\]resolvePrice|packages[/\\]fuel-core[/\\])/
    : /(?:^|[/\\])(?:src[/\\])?(?:services[/\\]fuelCalculationService|utils[/\\]fuelCycleEngine|components[/\\]admin[/\\]fuel-cost-analytics|packages[/\\]fuel-core[/\\])/;

const r = spawnSync(
  'pnpm',
  ['--filter', `@roam/${app}`, 'exec', 'tsc', '--noEmit', '-p', 'tsconfig.json'],
  { cwd: root, encoding: 'utf8', shell: true },
);

const out = `${r.stdout || ''}\n${r.stderr || ''}`;
const errors = out.split(/\r?\n/).filter((l) => l.includes('error TS'));
const money = errors.filter((l) => filter.test(l.replace(/\\/g, '/')));

if (money.length) {
  console.error(`Fuel money typecheck failed (${app}): ${money.length} error(s)`);
  for (const l of money) console.error(l);
  process.exit(1);
}

console.log(
  `Fuel money typecheck OK (${app}): 0 money-spine errors (${errors.length} other tsc errors ignored until full-app typecheck cleanup)`,
);
process.exit(0);
