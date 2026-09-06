/**
 * Fail CI only on driver-spine TypeScript errors (DRIVER_SECTION_AUDIT R4-2).
 * Full-app `tsc` still has a large backlog; this gates the driver Operations path.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Paths that belong to Driver Operations (list / detail / analytics / payout math). */
const filter =
  /(?:^|[/\\])(?:src[/\\])?(?:components[/\\]drivers[/\\]|hooks[/\\]useDriver|utils[/\\]identityMatcher|utils[/\\]buildLedgerPayoutPeriodRows|utils[/\\]computePayoutSummaryTotals|utils[/\\]driverOperationalMetrics|utils[/\\]driverAnalyticsAggregates|utils[/\\]driverSettlementMath|utils[/\\]payoutDraftFuel|types[/\\]driverPayoutPeriod)/;

const r = spawnSync(
  'pnpm',
  ['--filter', '@roam/fleet', 'exec', 'tsc', '--noEmit', '-p', 'tsconfig.json'],
  { cwd: root, encoding: 'utf8', shell: true },
);

const out = `${r.stdout || ''}\n${r.stderr || ''}`;
const errors = out.split(/\r?\n/).filter((l) => l.includes('error TS'));
const driver = errors.filter((l) => filter.test(l.replace(/\\/g, '/')));

if (driver.length) {
  console.error(`Driver section typecheck failed: ${driver.length} error(s)`);
  for (const l of driver) console.error(l);
  process.exit(1);
}

console.log(
  `Driver section typecheck OK: 0 driver-spine errors (${errors.length} other tsc errors ignored until full-app typecheck cleanup)`,
);
process.exit(0);
