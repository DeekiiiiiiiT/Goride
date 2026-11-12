/**
 * Week Reconciliation screens read the calculator's saved desk only (WRA-07, WRA-26).
 * The week steps must never call the live week-close preview or sync, and never
 * import money engines. Close / Reopen / Accept cash buttons are changes, so allowed.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const DIR = 'apps/fleet/src/components/fleet-financials/recon';
const FORBIDDEN = [
  { re: /weekCloseApi\.preview\s*\(/, why: 'live week-close preview' },
  { re: /weekCloseApi\.sync\s*\(/, why: 'live week-close sync' },
  { re: /forceResealHintsFromPreview/, why: 'auto-reseal from the live preview' },
  { re: /from ['"][^'"]*(fuelCalculation|tollReconciliation|settlementCalculation|computePeriodSettlement)[^'"]*['"]/, why: 'money engine import' },
];

let failed = false;
for (const name of readdirSync(DIR)) {
  if (!/\.(tsx?|jsx?)$/.test(name) || /\.test\./.test(name)) continue;
  const file = path.join(DIR, name);
  const src = readFileSync(file, 'utf8');
  for (const f of FORBIDDEN) {
    if (f.re.test(src)) {
      console.error(`${file}: ${f.why} is not allowed in the Week Reconciliation steps`);
      failed = true;
    }
  }
}
if (failed) process.exit(1);
console.log('week desk reads the saved desk only');
